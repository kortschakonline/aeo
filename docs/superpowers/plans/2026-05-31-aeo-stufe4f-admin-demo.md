# AEO-Tool Stufe 4f — Admin & Demo-Zugang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E-Mail-Allowlists für Gratis-Groß-Demo-Zugänge (`COMP_EMAILS`) und ein geschütztes Admin-Backend (`ADMIN_EMAILS`) mit Übersicht aller Scans/Reports/Leads/Accounts.

**Architecture:** Reine Allowlist-Helfer (`isAdminEmail`/`isCompEmail`) + `resolvePlan` heben Comp-/Admin-Mails ohne Stripe auf 'gross'. `getAccountPlan` berücksichtigt das, sodass das bestehende Monitor-Gating greift. Eine admin-gated `/admin`-Server-Seite liest read-only-Übersichten; `/report/[id]` erlaubt Admins jeden Report.

**Tech Stack:** Next.js 16 (Server Components, `redirect`, `force-dynamic`), Drizzle/postgres-js, Vitest.

**Konventionen (verifiziert):** `getSession()` → `{accountId,email}`. `getAccountPlan` (4c, repo.ts:204) = `effectivePlan(getSubscription(...))`. `effectivePlan` in `src/billing/plans.ts`. `/report/[id]` (page.tsx) owner-gated. `app/layout.tsx` ist async, liest `getSession`, gibt `isLoggedIn` an `SiteHeader`. Vitest `node`-Env ohne DB → nur reine Logik unit-getestet; DB/Seiten via `tsc`+`build`+manuell. Server-Seiten mit DB-Zugriff brauchen `export const dynamic = "force-dynamic"`.

---

## File Structure

**Neu:** `src/billing/access.ts` (Allowlists, rein), `src/auth/admin.ts` (`requireAdmin`), `tests/access.test.ts`, `app/admin/page.tsx`.
**Geändert:** `src/billing/plans.ts` (+`resolvePlan`), `src/db/repo.ts` (`getAccountPlan` mit Comp + Admin-Queries), `app/report/[id]/page.tsx` (Admin-Bypass), `app/layout.tsx` (+`isAdmin`), `components/SiteHeader.tsx` (+Admin-Link), `docker-compose.yml` (+Envs).

---

## Task 1: Allowlists & resolvePlan — TDD

**Files:** Create `src/billing/access.ts`; Modify `src/billing/plans.ts`; Test `tests/access.test.ts`

- [ ] **Step 1: Failing test** — `tests/access.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isAdminEmail, isCompEmail } from '@/src/billing/access'
import { resolvePlan } from '@/src/billing/plans'

const env = { ADMIN_EMAILS: 'boss@kortschak.online', COMP_EMAILS: 'kollege@kortschak.online, zwei@x.at' }

describe('isAdminEmail', () => {
  it('Treffer case-insensitive + getrimmt', () => {
    expect(isAdminEmail('boss@kortschak.online', env)).toBe(true)
    expect(isAdminEmail('BOSS@kortschak.online', env)).toBe(true)
  })
  it('kein Treffer / leere Env', () => {
    expect(isAdminEmail('x@y.at', env)).toBe(false)
    expect(isAdminEmail('x@y.at', {})).toBe(false)
  })
})

describe('isCompEmail', () => {
  it('Treffer in COMP', () => {
    expect(isCompEmail('kollege@kortschak.online', env)).toBe(true)
    expect(isCompEmail('zwei@x.at', env)).toBe(true)
  })
  it('Admin ist automatisch Comp', () => {
    expect(isCompEmail('boss@kortschak.online', env)).toBe(true)
  })
  it('sonst false', () => {
    expect(isCompEmail('fremd@y.at', env)).toBe(false)
  })
})

describe('resolvePlan', () => {
  it('isComp → gross (auch ohne/abgelaufenes Abo)', () => {
    expect(resolvePlan(null, true)).toBe('gross')
    expect(resolvePlan({ plan: 'klein', status: 'canceled' }, true)).toBe('gross')
  })
  it('nicht comp → effectivePlan', () => {
    expect(resolvePlan({ plan: 'klein', status: 'active' }, false)).toBe('klein')
    expect(resolvePlan(null, false)).toBe('free')
    expect(resolvePlan({ plan: 'gross', status: 'canceled' }, false)).toBe('free')
  })
})
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run tests/access.test.ts` (Module/Export fehlen).

- [ ] **Step 3: `src/billing/access.ts`**
```ts
type AccessEnv = { ADMIN_EMAILS?: string; COMP_EMAILS?: string }

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string, env: AccessEnv = process.env): boolean {
  return parseList(env.ADMIN_EMAILS).includes(email.toLowerCase())
}

export function isCompEmail(email: string, env: AccessEnv = process.env): boolean {
  return isAdminEmail(email, env) || parseList(env.COMP_EMAILS).includes(email.toLowerCase())
}
```

- [ ] **Step 4: `resolvePlan` in `src/billing/plans.ts` anfügen** (nach `effectivePlan`):
```ts
export function resolvePlan(sub: { plan: Plan; status: string } | null, isComp: boolean): Plan {
  if (isComp) return 'gross'
  return effectivePlan(sub)
}
```

- [ ] **Step 5: Run, verify PASS** — `npx vitest run tests/access.test.ts` (alle grün).

- [ ] **Step 6: Commit**
```bash
git add src/billing/access.ts src/billing/plans.ts tests/access.test.ts
git commit -m "feat(access): Allowlist-Helfer + resolvePlan (Comp→gross) (TDD)"
```

---

## Task 2: getAccountPlan mit Comp + Admin-Repo-Queries

**Files:** Modify `src/db/repo.ts`

- [ ] **Step 1: Imports erweitern**

In `src/db/repo.ts`: die Plan-Import-Zeile (`import { effectivePlan, type Plan } from '@/src/billing/plans'`) um `resolvePlan` erweitern und `isCompEmail` importieren:
```ts
import { effectivePlan, resolvePlan, type Plan } from '@/src/billing/plans'
import { isCompEmail } from '@/src/billing/access'
```

- [ ] **Step 2: `getAccountPlan` ersetzen**

Die bestehende Funktion (repo.ts:204) ersetzen durch:
```ts
export async function getAccountPlan(accountId: number): Promise<Plan> {
  await ensureSchema()
  const [acc] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, accountId))
  const sub = await getSubscription(accountId)
  const subInput = sub ? { plan: sub.plan as Plan, status: sub.status } : null
  return resolvePlan(subInput, acc ? isCompEmail(acc.email) : false)
}
```

- [ ] **Step 3: Admin-Queries anfügen** (am Ende von `src/db/repo.ts`)
```ts
// ---- Admin (Stufe 4f) ----

export async function getAdminStats() {
  await ensureSchema()
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM scans)::int AS total_scans,
      (SELECT count(*) FROM scans WHERE created_at >= current_date)::int AS scans_today,
      (SELECT coalesce(round(avg(total)), 0) FROM scans)::int AS avg_score,
      (SELECT count(*) FROM leads)::int AS total_leads,
      (SELECT count(*) FROM subscriptions WHERE status IN ('active','trialing'))::int AS active_subs
  `)) as unknown as Array<{
    total_scans: number; scans_today: number; avg_score: number; total_leads: number; active_subs: number
  }>
  const r = rows[0]
  return {
    totalScans: Number(r?.total_scans ?? 0),
    scansToday: Number(r?.scans_today ?? 0),
    avgScore: Number(r?.avg_score ?? 0),
    totalLeads: Number(r?.total_leads ?? 0),
    activeSubs: Number(r?.active_subs ?? 0),
  }
}

export async function getRecentScansWithLead(limit = 100) {
  await ensureSchema()
  return db
    .select({
      id: scans.id,
      domain: scans.domain,
      total: scans.total,
      createdAt: scans.createdAt,
      leadEmail: sql<string | null>`(SELECT email FROM leads WHERE leads.scan_id = ${scans.id} ORDER BY id LIMIT 1)`,
    })
    .from(scans)
    .orderBy(desc(scans.createdAt))
    .limit(limit)
}

export async function getRecentLeads(limit = 100) {
  await ensureSchema()
  return db
    .select({ email: leads.email, domain: scans.domain, createdAt: leads.createdAt })
    .from(leads)
    .innerJoin(scans, eq(leads.scanId, scans.id))
    .orderBy(desc(leads.createdAt))
    .limit(limit)
}

export async function getAccountsOverview() {
  await ensureSchema()
  return db
    .select({
      id: accounts.id,
      email: accounts.email,
      createdAt: accounts.createdAt,
      plan: subscriptions.plan,
      status: subscriptions.status,
      monitorCount: sql<number>`(SELECT count(*) FROM monitors WHERE monitors.account_id = ${accounts.id} AND monitors.active = true)::int`,
    })
    .from(accounts)
    .leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
    .orderBy(desc(accounts.createdAt))
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (genutzt: `resolvePlan`, `isCompEmail`, `accounts`, `leads`, `scans`, `subscriptions`, `monitors`, `eq`, `desc`, `sql`).

- [ ] **Step 5: Commit**
```bash
git add src/db/repo.ts
git commit -m "feat(admin): getAccountPlan mit Comp-Override + Admin-Übersichts-Queries"
```

---

## Task 3: requireAdmin & Report-Admin-Bypass

**Files:** Create `src/auth/admin.ts`; Modify `app/report/[id]/page.tsx`

- [ ] **Step 1: `src/auth/admin.ts`**
```ts
import { redirect } from 'next/navigation'
import { getSession } from '@/src/auth/session'
import { isAdminEmail } from '@/src/billing/access'

/** Server-seitig: liefert die Admin-Session oder redirectet zu /login. */
export async function requireAdmin(): Promise<{ accountId: number; email: string }> {
  const session = await getSession()
  if (!session || !isAdminEmail(session.email)) redirect('/login')
  return session
}
```

- [ ] **Step 2: `/report/[id]` Admin-Bypass**

In `app/report/[id]/page.tsx`: `isAdminEmail` importieren und die `owned`-Zeile erweitern. Import oben ergänzen:
```ts
import { isAdminEmail } from "@/src/billing/access";
```
Die Zeile
```ts
  const owned = !!session && scan.accountId != null && scan.accountId === session.accountId;
```
ersetzen durch:
```ts
  const owned =
    !!session &&
    ((scan.accountId != null && scan.accountId === session.accountId) || isAdminEmail(session.email));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**
```bash
git add src/auth/admin.ts app/report/[id]/page.tsx
git commit -m "feat(admin): requireAdmin-Gate + Report-Admin-Bypass"
```

---

## Task 4: Admin-Seite `/admin`

**Files:** Create `app/admin/page.tsx`

- [ ] **Step 1: Implementierung**

`app/admin/page.tsx`:
```tsx
import Link from "next/link";
import { requireAdmin } from "@/src/auth/admin";
import {
  getAdminStats,
  getRecentScansWithLead,
  getRecentLeads,
  getAccountsOverview,
} from "@/src/db/repo";
import { isCompEmail } from "@/src/billing/access";
import { effectivePlan, type Plan } from "@/src/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(d: Date): string {
  return d.toLocaleDateString("de-AT");
}

function planLabel(p: Plan): string {
  return p === "free" ? "Gratis" : p === "klein" ? "Klein" : "Groß";
}

export default async function AdminPage() {
  await requireAdmin();

  const [stats, recentScans, recentLeads, accountsOverview] = await Promise.all([
    getAdminStats(),
    getRecentScansWithLead(100),
    getRecentLeads(100),
    getAccountsOverview(),
  ]);

  const kpis = [
    { label: "Scans gesamt", value: stats.totalScans },
    { label: "Scans heute", value: stats.scansToday },
    { label: "Ø-Score", value: stats.avgScore },
    { label: "Leads", value: stats.totalLeads },
    { label: "Aktive Abos", value: stats.activeSubs },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Admin</p>
      <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Protokolle & Übersicht</h1>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <div className="font-mono text-2xl text-ink">{k.value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Scans */}
      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Scans (neueste {recentScans.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Datum</th>
              <th className="px-4 py-2 font-mono font-normal">Domain</th>
              <th className="px-4 py-2 font-mono font-normal">Score</th>
              <th className="px-4 py-2 font-mono font-normal">Lead</th>
              <th className="px-4 py-2 font-mono font-normal">Report</th>
            </tr>
          </thead>
          <tbody>
            {recentScans.map((s) => (
              <tr key={s.id} className="border-b border-line/50">
                <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(s.createdAt)}</td>
                <td className="px-4 py-2 text-ink">{s.domain}</td>
                <td className="px-4 py-2 font-mono text-muted">{s.total}</td>
                <td className="px-4 py-2 font-mono text-xs text-faint">{s.leadEmail ?? "–"}</td>
                <td className="px-4 py-2">
                  <Link href={`/report/${s.id}`} className="text-xs text-brand hover:underline">
                    öffnen →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Leads */}
      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Leads (neueste {recentLeads.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Datum</th>
              <th className="px-4 py-2 font-mono font-normal">E-Mail</th>
              <th className="px-4 py-2 font-mono font-normal">Domain</th>
            </tr>
          </thead>
          <tbody>
            {recentLeads.map((l, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(l.createdAt)}</td>
                <td className="px-4 py-2 text-ink">{l.email}</td>
                <td className="px-4 py-2 text-muted">{l.domain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Accounts */}
      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Accounts ({accountsOverview.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Erstellt</th>
              <th className="px-4 py-2 font-mono font-normal">E-Mail</th>
              <th className="px-4 py-2 font-mono font-normal">Plan</th>
              <th className="px-4 py-2 font-mono font-normal">Monitore</th>
            </tr>
          </thead>
          <tbody>
            {accountsOverview.map((a) => {
              const plan: Plan = isCompEmail(a.email)
                ? "gross"
                : effectivePlan(a.plan && a.status ? { plan: a.plan as Plan, status: a.status } : null);
              return (
                <tr key={a.id} className="border-b border-line/50">
                  <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-2 text-ink">{a.email}</td>
                  <td className="px-4 py-2 font-mono text-xs text-brand">{planLabel(plan)}</td>
                  <td className="px-4 py-2 font-mono text-muted">{a.monitorCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck & Build**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
Run: `npm run build`
Expected: erfolgreich; `/admin` als ƒ (Dynamic) gelistet.

- [ ] **Step 3: Commit**
```bash
git add app/admin/
git commit -m "feat(admin): /admin-Seite (Kennzahlen, Scans+Report, Leads, Accounts)"
```

---

## Task 5: Admin-Link im Header + Compose-Env

**Files:** Modify `app/layout.tsx`, `components/SiteHeader.tsx`, `docker-compose.yml`

- [ ] **Step 1: Layout berechnet `isAdmin`**

In `app/layout.tsx`: `isAdminEmail` importieren und an `SiteHeader` weitergeben.
Import ergänzen:
```ts
import { isAdminEmail } from "@/src/billing/access";
```
Die Zeile `const session = await getSession().catch(() => null);` lassen und darunter ergänzen:
```ts
  const isAdmin = !!session && isAdminEmail(session.email);
```
Den `<SiteHeader isLoggedIn={!!session} />`-Aufruf ersetzen durch:
```tsx
        <SiteHeader isLoggedIn={!!session} isAdmin={isAdmin} />
```

- [ ] **Step 2: SiteHeader rendert Admin-Link**

In `components/SiteHeader.tsx`: das Interface + die Funktionssignatur um `isAdmin` erweitern:
```tsx
interface SiteHeaderProps {
  isLoggedIn?: boolean;
  isAdmin?: boolean;
}

export default function SiteHeader({ isLoggedIn, isAdmin }: SiteHeaderProps) {
```
Im rechten `<div className="flex items-center gap-6">`, NACH dem „Preise"-Link und VOR dem Dashboard/Anmelden-Link, einfügen:
```tsx
          {isAdmin && (
            <Link
              href="/admin"
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand transition-colors hover:text-ink"
            >
              Admin
            </Link>
          )}
```

- [ ] **Step 3: Compose-Env**

In `docker-compose.yml` in der `app`-`environment`-Liste (nach den `STRIPE_*`-Zeilen) ergänzen:
```yaml
      - ADMIN_EMAILS=${ADMIN_EMAILS}
      - COMP_EMAILS=${COMP_EMAILS}
```

- [ ] **Step 4: Typecheck & Build**

Run: `npx tsc --noEmit`
Expected: keine Fehler.
Run: `npm run build`
Expected: erfolgreich.

- [ ] **Step 5: Commit**
```bash
git add app/layout.tsx components/SiteHeader.tsx docker-compose.yml
git commit -m "feat(admin): Admin-Link im Header + ADMIN_EMAILS/COMP_EMAILS-Envs"
```

---

## Task 6: Gesamt-Verifikation & Deploy-Hinweise

**Files:** keine (nur Prüfungen)

- [ ] **Step 1: Tests** — Run: `npm test` — Expected: alle grün (inkl. `tests/access.test.ts`).
- [ ] **Step 2: Lint** — Run: `npx eslint src/billing src/auth/admin.ts tests/access.test.ts app/admin app/report app/layout.tsx components/SiteHeader.tsx src/db/repo.ts` — Expected: keine Fehler.
- [ ] **Step 3: Build** — Run: `npm run build` — Expected: erfolgreich; `/admin` (ƒ) gelistet.
- [ ] **Step 4: Manueller Smoke (mit lokaler DB + Envs)** — `ADMIN_EMAILS=deine@mail`, einloggen → Header zeigt „Admin", `/admin` lädt; mit Nicht-Admin-Mail → `/admin` redirectet `/login`. Comp-Mail → Monitor-Toggle erlaubt 10 Domains ohne Abo.
- [ ] **Step 5: Deploy** — Teil des 4c-Deploys: Push `master` → Build → `VPS_updateProjectV1(1478430, "aeo")`. **`ADMIN_EMAILS` + `COMP_EMAILS` in der VPS-Projekt-Env setzen** (deine Mail als Admin, Kollegen als Comp). Keine neuen Tabellen (`ensureSchema` unverändert). Für die Demo ist KEIN Stripe-Setup nötig.

---

## Self-Review-Notiz (Plan ↔ Spec)

- **Allowlists + resolvePlan (TDD)** → T1. **getAccountPlan Comp + Admin-Queries** → T2. **requireAdmin + Report-Bypass** → T3. **/admin-Seite (4 Blöcke)** → T4. **Header-Link + Envs** → T5. **Verifikation/Deploy** → T6.
- **Comp ohne Stripe → gross**: `resolvePlan` (T1) via `getAccountPlan` (T2); Monitor-Toggle nutzt das bereits.
- **Admins sind Comp**: `isCompEmail` ruft `isAdminEmail`.
- **Nur reine Logik unit-getestet** (T1); Admin-Seite/Queries via Build + manueller Smoke.
- **Fail-safe Default**: ohne gesetzte Envs ist niemand Admin/Comp (alle 'free', kein /admin-Zugang).
