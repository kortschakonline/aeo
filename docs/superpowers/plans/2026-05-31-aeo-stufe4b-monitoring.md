# AEO-Tool Stufe 4b — Monitoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wöchentliche automatische Re-Scans für vom Nutzer gewählte Domains (Toggle, max. 3/Account) mit E-Mail-Alert bei Änderung des Gesamt-Scores.

**Architecture:** Neue Tabelle `monitors` (account-gebunden, pro Domain). Ein geschützter Endpoint `POST /api/monitoring/run` (Bearer-Secret) wird wöchentlich von einem GitHub-Actions-Cron getriggert, scannt fällige Monitore via `runScan`, speichert die datierten Ergebnisse in `scans` (erscheinen automatisch im Dashboard-Verlauf) und mailt bei Score-Änderung. Die Fälligkeits-/Änderungs-/Limit-Regeln sind reine, unit-getestete Funktionen.

**Tech Stack:** Next.js 16 (Route Handler, async `cookies()`), Drizzle ORM + postgres-js, Zod, nodemailer, Playwright (über `runScan`), Vitest, GitHub Actions.

**Konventionen (aus 4a verifiziert):**
- Route Handler: `import { NextRequest, NextResponse } from 'next/server'`, `export const runtime = 'nodejs'`.
- `getSession()` aus `@/src/auth/session` für eingeloggte Routen; gibt `{accountId, email}|null`.
- Vitest läuft `node`-Env **ohne DB** → nur reine Logik bekommt Unit-Tests; DB-/Route-/Playwright-Glue via `npx tsc --noEmit` + `npm run build` + manueller curl-Smoke.
- `ensureSchema()` erzeugt Tabellen idempotent (kein `drizzle-kit push`).
- Dashboard ist bereits `export const dynamic = "force-dynamic"`.

---

## File Structure

**Neu:**
- `src/monitoring/constants.ts` — `MAX_MONITORS`, `MONITOR_INTERVAL_DAYS`, `MONITOR_RUN_CAP`.
- `src/monitoring/logic.ts` — reine Funktionen `isDue`, `scoreChange`, `canEnable`. **Getestet.**
- `tests/monitoring.test.ts` — Unit-Tests.
- `app/api/monitoring/toggle/route.ts` — POST, Login, an/aus pro Domain (Limit-Prüfung).
- `app/api/monitoring/run/route.ts` — POST, Secret-geschützt, Wochenlauf.
- `components/MonitorToggle.tsx` — Client-Toggle im Dashboard.
- `.github/workflows/monitoring.yml` — Wochen-Cron + manueller Trigger.

**Geändert:**
- `src/db/schema.ts` — Drizzle-Tabelle `monitors` + `boolean`-Import.
- `src/db/migrate.ts` — `ensureSchema()` um `monitors` + Indizes erweitert.
- `src/db/repo.ts` — Monitor-Repo-Funktionen.
- `src/mail/notifier.ts` — `sendMonitoringAlert`.
- `app/dashboard/page.tsx` — Monitor-Zustände laden + Toggle einbinden.
- `app/datenschutz/page.tsx` — Monitoring-Abschnitt.
- `docker-compose.yml` — `MONITORING_SECRET`-Env (Doku/Konsistenz).

---

## Task 1: DB-Schema & Migration für `monitors`

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Drizzle-Tabelle ergänzen**

In `src/db/schema.ts`: den Import aus `drizzle-orm/pg-core` um `boolean` erweitern (aktuell `import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'` → `boolean` hinzufügen). Am Ende der Datei anfügen:

```ts
export const monitors = pgTable('monitors', {
  id: serial('id').primaryKey(),
  accountId: integer('account_id').references(() => accounts.id).notNull(),
  domain: text('domain').notNull(),
  url: text('url').notNull(),
  active: boolean('active').default(true).notNull(),
  lastRunAt: timestamp('last_run_at'),
  lastScore: integer('last_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: `ensureSchema()` erweitern**

In `src/db/migrate.ts`, innerhalb des `async () => { … }`-Blocks, NACH der letzten bestehenden Zeile (`CREATE INDEX IF NOT EXISTS scans_account_id_idx …`) und VOR dem Ende des Blocks, anfügen:

```ts
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS monitors (
          id serial PRIMARY KEY,
          account_id integer NOT NULL REFERENCES accounts(id),
          domain text NOT NULL,
          url text NOT NULL,
          active boolean NOT NULL DEFAULT true,
          last_run_at timestamp,
          last_score integer,
          created_at timestamp DEFAULT now() NOT NULL
        )
      `)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS monitors_account_domain_idx ON monitors (account_id, domain)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS monitors_active_last_run_idx ON monitors (active, last_run_at)`)
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts
git commit -m "feat(db): monitors-Tabelle für Stufe 4b (Schema + Migration)"
```

---

## Task 2: Konstanten & Kernlogik — TDD

**Files:**
- Create: `src/monitoring/constants.ts`
- Create: `src/monitoring/logic.ts`
- Test: `tests/monitoring.test.ts`

- [ ] **Step 1: Konstanten anlegen**

`src/monitoring/constants.ts`:
```ts
export const MAX_MONITORS = 3
export const MONITOR_INTERVAL_DAYS = 7
export const MONITOR_RUN_CAP = 25
```

- [ ] **Step 2: Failing test schreiben**

`tests/monitoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isDue, scoreChange, canEnable } from '@/src/monitoring/logic'

const NOW = new Date('2026-06-01T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

describe('isDue', () => {
  it('noch nie gelaufen → fällig', () => {
    expect(isDue({ active: true, lastRunAt: null }, NOW)).toBe(true)
  })
  it('frisch gelaufen (<7 Tage) → nicht fällig', () => {
    expect(isDue({ active: true, lastRunAt: daysAgo(3) }, NOW)).toBe(false)
  })
  it('überfällig (>7 Tage) → fällig', () => {
    expect(isDue({ active: true, lastRunAt: daysAgo(8) }, NOW)).toBe(true)
  })
  it('inaktiv → nie fällig', () => {
    expect(isDue({ active: false, lastRunAt: null }, NOW)).toBe(false)
  })
})

describe('scoreChange', () => {
  it('Baseline (oldScore null) → keine Änderung', () => {
    expect(scoreChange(null, 80)).toEqual({ changed: false, direction: 'none' })
  })
  it('gleich → keine Änderung', () => {
    expect(scoreChange(80, 80)).toEqual({ changed: false, direction: 'none' })
  })
  it('gestiegen → changed up', () => {
    expect(scoreChange(70, 80)).toEqual({ changed: true, direction: 'up' })
  })
  it('gefallen → changed down', () => {
    expect(scoreChange(80, 70)).toEqual({ changed: true, direction: 'down' })
  })
})

describe('canEnable', () => {
  it('unter Limit → erlaubt', () => {
    expect(canEnable(2, 3, false)).toBe(true)
  })
  it('am Limit & neu → verboten', () => {
    expect(canEnable(3, 3, false)).toBe(false)
  })
  it('am Limit & bereits aktiv → erlaubt (Idempotenz)', () => {
    expect(canEnable(3, 3, true)).toBe(true)
  })
})
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/monitoring.test.ts`
Expected: FAIL (Modul `@/src/monitoring/logic` fehlt).

- [ ] **Step 4: Logik implementieren**

`src/monitoring/logic.ts`:
```ts
import { MONITOR_INTERVAL_DAYS } from '@/src/monitoring/constants'

export type MonitorDueInput = { active: boolean; lastRunAt: Date | null }

export function isDue(monitor: MonitorDueInput, now: Date = new Date()): boolean {
  if (!monitor.active) return false
  if (monitor.lastRunAt == null) return true
  const threshold = now.getTime() - MONITOR_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  return monitor.lastRunAt.getTime() < threshold
}

export function scoreChange(
  oldScore: number | null,
  newScore: number,
): { changed: boolean; direction: 'up' | 'down' | 'none' } {
  if (oldScore == null || newScore === oldScore) return { changed: false, direction: 'none' }
  return { changed: true, direction: newScore > oldScore ? 'up' : 'down' }
}

export function canEnable(activeCount: number, max: number, alreadyActive: boolean): boolean {
  return alreadyActive || activeCount < max
}
```

- [ ] **Step 5: Test ausführen — muss bestehen**

Run: `npx vitest run tests/monitoring.test.ts`
Expected: PASS (11 Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/monitoring/constants.ts src/monitoring/logic.ts tests/monitoring.test.ts
git commit -m "feat(monitoring): Kernlogik isDue/scoreChange/canEnable + Konstanten (TDD)"
```

---

## Task 3: Repo-Funktionen für Monitore

**Files:**
- Modify: `src/db/repo.ts`

- [ ] **Step 1: Imports erweitern**

In `src/db/repo.ts`: die Schema-Import-Zeile um `monitors` erweitern und den Operator `and` ergänzen. Die aktuellen Zeilen lauten:
```ts
import { scans, leads, accounts, loginTokens, sessions } from '@/src/db/schema'
import { eq, desc, sql } from 'drizzle-orm'
```
Ändern zu:
```ts
import { scans, leads, accounts, loginTokens, sessions, monitors } from '@/src/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Monitor-Funktionen anfügen**

Am Ende von `src/db/repo.ts`:
```ts
// ---- Monitoring (Stufe 4b) ----

export async function getMonitorsForAccount(accountId: number) {
  await ensureSchema()
  return db.select().from(monitors).where(eq(monitors.accountId, accountId))
}

export async function upsertMonitor(
  accountId: number,
  domain: string,
  url: string,
  active: boolean,
): Promise<void> {
  await ensureSchema()
  await db
    .insert(monitors)
    .values({ accountId, domain, url, active })
    .onConflictDoUpdate({
      target: [monitors.accountId, monitors.domain],
      set: { active, url },
    })
}

export async function latestScanUrlForDomain(accountId: number, domain: string): Promise<string | null> {
  await ensureSchema()
  const [row] = await db
    .select({ url: scans.url })
    .from(scans)
    .where(and(eq(scans.accountId, accountId), eq(scans.domain, domain)))
    .orderBy(desc(scans.createdAt))
    .limit(1)
  return row?.url ?? null
}

/** Alle aktiven Monitore mit Account-E-Mail (Join), älteste/nie-gelaufene zuerst. */
export async function getActiveMonitorsWithEmail() {
  await ensureSchema()
  return db
    .select({
      id: monitors.id,
      accountId: monitors.accountId,
      domain: monitors.domain,
      url: monitors.url,
      lastRunAt: monitors.lastRunAt,
      lastScore: monitors.lastScore,
      email: accounts.email,
    })
    .from(monitors)
    .innerJoin(accounts, eq(monitors.accountId, accounts.id))
    .where(eq(monitors.active, true))
    .orderBy(sql`${monitors.lastRunAt} ASC NULLS FIRST`)
}

export async function recordMonitorRun(monitorId: number, score: number): Promise<void> {
  await ensureSchema()
  await db.update(monitors).set({ lastRunAt: new Date(), lastScore: score }).where(eq(monitors.id, monitorId))
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (alle Imports genutzt: `eq`, `and`, `desc`, `sql`, `monitors`).

- [ ] **Step 4: Commit**

```bash
git add src/db/repo.ts
git commit -m "feat(db): Monitor-Repo-Funktionen (upsert, due-with-email, record, latest-url)"
```

---

## Task 4: Alert-Mail

**Files:**
- Modify: `src/mail/notifier.ts`

- [ ] **Step 1: `sendMonitoringAlert` anfügen**

Am Ende von `src/mail/notifier.ts` (der Datei mit dem bestehenden `createTransport`-Helfer und `notifyLead`/`sendMagicLink`):
```ts
export async function sendMonitoringAlert(
  email: string,
  domain: string,
  oldScore: number,
  newScore: number,
): Promise<void> {
  const transport = createTransport()
  if (!transport) { console.warn('SMTP nicht konfiguriert, überspringe Monitoring-Alert'); return }
  const arrow = newScore > oldScore ? '↑' : '↓'
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: `AEO-Score für ${domain}: ${oldScore} → ${newScore}`,
    text: `Hallo,\n\nder AEO-Score deiner überwachten Domain ${domain} hat sich geändert:\n\n${oldScore} → ${newScore} (${arrow})\n\nDetails im Dashboard: https://aeo.kortschak.online/dashboard\n\n— AEO-Tool, Kortschak`,
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/mail/notifier.ts
git commit -m "feat(mail): sendMonitoringAlert für Score-Änderungen"
```

---

## Task 5: Route `POST /api/monitoring/toggle`

**Files:**
- Create: `app/api/monitoring/toggle/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/monitoring/toggle/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/src/auth/session'
import { getMonitorsForAccount, latestScanUrlForDomain, upsertMonitor } from '@/src/db/repo'
import { canEnable } from '@/src/monitoring/logic'
import { MAX_MONITORS } from '@/src/monitoring/constants'

export const runtime = 'nodejs'

const Body = z.object({ domain: z.string().min(1), active: z.boolean() })

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const { domain, active } = parsed.data

  if (active) {
    const list = await getMonitorsForAccount(session.accountId)
    const alreadyActive = list.some((m) => m.domain === domain && m.active)
    const activeCount = list.filter((m) => m.active).length
    if (!canEnable(activeCount, MAX_MONITORS, alreadyActive)) {
      return NextResponse.json({ error: `Limit erreicht (max. ${MAX_MONITORS})` }, { status: 409 })
    }
  }

  const url = await latestScanUrlForDomain(session.accountId, domain)
  if (!url) return NextResponse.json({ error: 'Keine Scan-URL für diese Domain' }, { status: 400 })

  await upsertMonitor(session.accountId, domain, url, active)
  return NextResponse.json({ ok: true, active })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/monitoring/toggle/route.ts
git commit -m "feat(monitoring): POST /api/monitoring/toggle (Login, Limit-Prüfung)"
```

---

## Task 6: Route `POST /api/monitoring/run`

**Files:**
- Create: `app/api/monitoring/run/route.ts`

- [ ] **Step 1: Implementierung**

`app/api/monitoring/run/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getActiveMonitorsWithEmail, recordMonitorRun, saveScan } from '@/src/db/repo'
import { runScan } from '@/src/engine/scan'
import { isDue, scoreChange } from '@/src/monitoring/logic'
import { MONITOR_RUN_CAP } from '@/src/monitoring/constants'
import { sendMonitoringAlert } from '@/src/mail/notifier'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.MONITORING_SECRET
  if (!secret) return NextResponse.json({ error: 'Monitoring nicht konfiguriert' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const now = new Date()
  const active = await getActiveMonitorsWithEmail()
  const due = active.filter((m) => isDue({ active: true, lastRunAt: m.lastRunAt }, now))
  const batch = due.slice(0, MONITOR_RUN_CAP)

  let alerted = 0
  let errors = 0
  for (const m of batch) {
    try {
      const result = await runScan(m.url)
      await saveScan(result, m.accountId)
      const change = scoreChange(m.lastScore, result.total)
      if (change.changed) {
        await sendMonitoringAlert(m.email, m.domain, m.lastScore as number, result.total)
        alerted++
      }
      await recordMonitorRun(m.id, result.total)
    } catch (e) {
      errors++
      console.error(`Monitoring-Scan fehlgeschlagen für ${m.domain}:`, e)
    }
  }

  return NextResponse.json({ checked: batch.length, alerted, errors, capped: due.length > MONITOR_RUN_CAP })
}
```

Hinweise:
- `m.lastScore as number` ist sicher, weil `change.changed` nur bei `lastScore != null` true ist.
- Ein fehlgeschlagener Scan setzt `last_run_at` NICHT (der `recordMonitorRun`-Aufruf wird im catch übersprungen) → die Domain wird beim nächsten Lauf erneut versucht.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add app/api/monitoring/run/route.ts
git commit -m "feat(monitoring): POST /api/monitoring/run (Secret-geschützt, Wochenlauf)"
```

---

## Task 7: Dashboard-Toggle

**Files:**
- Create: `components/MonitorToggle.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: `MonitorToggle` (Client)**

`components/MonitorToggle.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MonitorToggle({
  domain,
  active,
  lastRunAt,
}: {
  domain: string;
  active: boolean;
  lastRunAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function toggle() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/monitoring/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, active: !active }),
      });
      if (res.status === 409) {
        const d = await res.json();
        setMsg(d.error ?? "Limit erreicht");
        return;
      }
      if (!res.ok) {
        setMsg("Fehler");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors disabled:opacity-60 ${
          active ? "border-brand text-brand" : "border-line text-muted hover:text-ink"
        }`}
      >
        {active ? "Monitoring: An" : "Monitoring: Aus"}
      </button>
      <span className="font-mono text-[10px] text-faint">
        {active
          ? lastRunAt
            ? `wöchentlich · zuletzt ${new Date(lastRunAt).toLocaleDateString("de-AT")}`
            : "wöchentlich · läuft bald"
          : ""}
      </span>
      {msg && <span className="font-mono text-[10px] text-brand">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Dashboard-Page anpassen**

In `app/dashboard/page.tsx`:

(a) Imports ergänzen — `getMonitorsForAccount` zum bestehenden repo-Import hinzufügen und `MonitorToggle` importieren:
```tsx
import { getAccountScans, getMonitorsForAccount } from "@/src/db/repo";
import MonitorToggle from "@/components/MonitorToggle";
```

(b) Nach `const rows = (await getAccountScans(session.accountId)) as ScanRow[];` einfügen:
```tsx
  const monitorList = await getMonitorsForAccount(session.accountId);
  const monitorByDomain = new Map(monitorList.map((m) => [m.domain, m]));
```

(c) Innerhalb der `[...byDomain.entries()].map(([domain, scans]) => {`-Callback, direkt nach `const trend = …`, einfügen:
```tsx
            const mon = monitorByDomain.get(domain);
```

(d) Die rechte Spalte der Domain-Sektion ersetzen. Aktuell:
```tsx
                  <div className="flex flex-col items-end gap-3">
                    <Sparkline scores={trend} />
                    <RescanButton url={latest.url} />
                  </div>
```
ersetzen durch:
```tsx
                  <div className="flex flex-col items-end gap-3">
                    <Sparkline scores={trend} />
                    <MonitorToggle
                      domain={domain}
                      active={mon?.active ?? false}
                      lastRunAt={mon?.lastRunAt ? mon.lastRunAt.toISOString() : null}
                    />
                    <RescanButton url={latest.url} />
                  </div>
```

- [ ] **Step 3: Typecheck & Build**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
Run: `npm run build`
Expected: erfolgreich; `/dashboard` weiterhin dynamisch, `/api/monitoring/toggle` + `/api/monitoring/run` als ƒ gelistet.

- [ ] **Step 4: Commit**

```bash
git add components/MonitorToggle.tsx app/dashboard/page.tsx
git commit -m "feat(dashboard): Monitoring-Toggle pro Domain"
```

---

## Task 8: GitHub-Actions-Cron & Compose-Env

**Files:**
- Create: `.github/workflows/monitoring.yml`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Workflow anlegen**

`.github/workflows/monitoring.yml`:
```yaml
name: Weekly Monitoring

on:
  schedule:
    - cron: '0 5 * * 1' # Montag 05:00 UTC
  workflow_dispatch:

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger monitoring run
        run: |
          curl -fsS -X POST https://aeo.kortschak.online/api/monitoring/run \
            -H "Authorization: Bearer ${{ secrets.MONITORING_SECRET }}"
```

- [ ] **Step 2: Compose-Env ergänzen**

In `docker-compose.yml` in der `app`-`environment`-Liste (nach `- SMTP_PASS=${SMTP_PASS}`) hinzufügen:
```yaml
      - MONITORING_SECRET=${MONITORING_SECRET}
```

- [ ] **Step 3: YAML-Sanity**

Run: `node -e "require('fs').readFileSync('.github/workflows/monitoring.yml','utf8')" && echo OK`
Expected: `OK` (Datei lesbar). (Kein YAML-Linter im Projekt — visuell auf Einrückung prüfen.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/monitoring.yml docker-compose.yml
git commit -m "ci(monitoring): wöchentlicher Cron-Trigger + MONITORING_SECRET-Env"
```

---

## Task 9: Datenschutz-Abschnitt

**Files:**
- Modify: `app/datenschutz/page.tsx`

- [ ] **Step 1: Abschnitt einfügen**

`app/datenschutz/page.tsx` lesen und — im selben Markup-/Heading-Stil wie die bestehenden Abschnitte (lokale `H2`-Komponente + `<p className="mt-2">`) — einen neuen Abschnitt einfügen (sinnvoll direkt nach dem „Nutzerkonten & Login"-/„Löschung"-Block aus 4a):

Heading: „Monitoring"
Body: Aktivierst du für eine Domain das Monitoring, scannen wir diese Domain regelmäßig (wöchentlich) automatisch erneut und speichern das Ergebnis in deinem Konto. Ändert sich der Gesamt-Score gegenüber dem letzten Lauf, senden wir eine E-Mail an deine Konto-Adresse. Du kannst das Monitoring pro Domain jederzeit im Dashboard wieder deaktivieren.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 3: Commit**

```bash
git add app/datenschutz/page.tsx
git commit -m "docs(legal): Datenschutz um Monitoring-Abschnitt erweitert"
```

---

## Task 10: Gesamt-Verifikation & Deploy-Hinweise

**Files:** keine (nur Prüfungen)

- [ ] **Step 1: Alle Tests**

Run: `npm test`
Expected: alle grün (bestehende + neue `monitoring`-Tests).

- [ ] **Step 2: Lint der neuen/geänderten Dateien**

Run: `npx eslint src/monitoring tests/monitoring.test.ts app/api/monitoring components/MonitorToggle.tsx app/dashboard/page.tsx src/db/repo.ts src/mail/notifier.ts`
Expected: keine Fehler (ungenutzte Imports vermeiden).

- [ ] **Step 3: Production-Build**

Run: `npm run build`
Expected: erfolgreich; Routen `/api/monitoring/run` + `/api/monitoring/toggle` (ƒ) gelistet.

- [ ] **Step 4: Lokaler curl-Smoke (optional, falls lokale DB)**

Mit `DATABASE_URL` + `MONITORING_SECRET` gesetzt und `npm run dev`:
- `curl -i -X POST localhost:3000/api/monitoring/run` ohne Header → 401.
- `curl -i -X POST localhost:3000/api/monitoring/run -H "Authorization: Bearer <secret>"` → 200 `{checked,...}` (0, wenn keine fälligen Monitore).
- Im eingeloggten Dashboard Toggle testen; ein 4. aktiver Monitor → 409.

- [ ] **Step 5: Deploy**

1. Nach `master` pushen → GitHub Actions baut das Image. Nach Erfolg: `VPS_updateProjectV1(virtualMachineId=1478430, projectName="aeo")`.
2. **Einmalig `MONITORING_SECRET` setzen:** (a) als GitHub-Repo-Secret (Actions), (b) in der VPS-Projekt-Env (sonst antwortet der Endpoint mit 503). Werte identisch.
3. `ensureSchema()` legt `monitors` beim ersten Zugriff an.
4. Den Workflow „Weekly Monitoring" manuell via `workflow_dispatch` testen (sollte 2xx liefern), danach dem Wochen-Cron überlassen.

---

## Self-Review-Notiz (Plan ↔ Spec)

- **monitors-Tabelle** → Task 1. **Kernlogik isDue/scoreChange/canEnable + MAX_MONITORS** → Task 2. **Repo (upsert/active-with-email/record/latest-url/get-for-account)** → Task 3. **Alert-Mail** → Task 4. **Toggle-Route + Limit** → Task 5. **Run-Route (Secret 503/401, Cap, isDue-Filter, score-change-Alert, fehler-isoliert)** → Task 6. **Dashboard-Toggle** → Task 7. **GitHub-Actions-Cron + Compose-Env** → Task 8. **Datenschutz** → Task 9. **Verifikation/Deploy/Secret-Setup** → Task 10.
- **Einzige Quelle der „fällig"-Regel:** `isDue` (Task 2), im Run-Endpoint angewandt (Task 6) — kein SQL-Duplikat.
- **Nur reine Logik unit-getestet** (Task 2); DB/Route/Playwright via Build + curl-Smoke (wie 4a).
- **YAGNI:** kein separates Results-Table (Ergebnisse in `scans`), kein `countActiveMonitors`-Repo (Zählung aus `getMonitorsForAccount` in der Toggle-Route).
