# AEO-Tool — Stufe 4f: Admin & Demo-Zugang (Design)

**Datum:** 2026-05-31
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Vorgänger:** … 4a (Accounts), 4b (Monitoring, live), **4c (Abo/Billing, gebaut, noch nicht deployed)**

## Zweck & Kontext

Zwei zusammengehörige Betreiber-Funktionen, primär für die Team-Demo morgen:
1. **Demo-/Frei-Zugang:** Du + Kollegen sollen alle (Groß-)Funktionen testen, **ohne ein echtes Abo abzuschließen** — per E-Mail-Allowlist statt Stripe.
2. **Admin-Backend:** geschützte Übersicht über **alle Scans (inkl. Kundenansicht), Leads, Accounts/Abos/Monitore** — „was wurde beim Kunden ausgelesen und präsentiert".

Baut auf 4a–4c auf. Setzt 4c (Plan-Begriff `getAccountPlan`/`effectivePlan`, Tabellen) voraus und wird **zusammen mit/nach 4c** deployed.

## Locked-in Entscheidungen (Brainstorming 2026-05-31)

- **Allowlists getrennt:** `COMP_EMAILS` (Gratis-Groß) und `ADMIN_EMAILS` (Admin-Backend). **Admins sind automatisch Comp** (Groß).
- **Admin-Auth:** bestehende Magic-Link-Session + `ADMIN_EMAILS`-Check (kein zweites Passwort).
- **Comp-Plan:** rein über Env-Allowlist in der Plan-Auflösung (kein DB-Flag, keine Fake-Stripe-Abos).
- **Admin-Views:** alle vier — Kennzahlen, Scans+Report, Leads, Accounts/Abos/Monitore. **Read-only.**
- **Bewusst nicht:** Editieren/Löschen im Admin, CSV-Export, Pagination über ~100 hinaus.

## Bestehende Architektur (Ausgangspunkt)

- `getSession()` → `{accountId, email}`. `getAccountPlan(accountId)` (4c) → `effectivePlan(getSubscription(...))` ('free'|'klein'|'gross'). `effectivePlan`/`monitorLimit`/`monitorsToDeactivate` in `src/billing/plans.ts`.
- Tabellen: `scans` (url, domain, total, categories, checks, content_excerpt, ai_analysis, brand_visibility, account_id, created_at), `leads` (scan_id, email, created_at), `accounts`, `subscriptions`, `monitors`.
- `/report/[id]` (4a/4c) rendert einen gespeicherten Scan; aktuell owner-gated (`owned = session && scan.accountId === session.accountId`).
- `app/layout.tsx` liest bereits `getSession()` und gibt `isLoggedIn` an `SiteHeader`.
- Next 16: async `cookies()`, `redirect()` außerhalb try/catch, `runtime='nodejs'`, `force-dynamic` nötig, wo Server-Komponenten beim Build sonst DB-prerendern. Vitest `node`-Env ohne DB → nur reine Logik unit-getestet.

## Zugriff & Plan-Auflösung — `src/billing/access.ts` (rein, getestet)

```ts
function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

type AccessEnv = { ADMIN_EMAILS?: string; COMP_EMAILS?: string }

export function isAdminEmail(email: string, env: AccessEnv = process.env): boolean {
  return parseList(env.ADMIN_EMAILS).includes(email.toLowerCase())
}

export function isCompEmail(email: string, env: AccessEnv = process.env): boolean {
  // Admins sind automatisch Comp (Groß).
  return isAdminEmail(email, env) || parseList(env.COMP_EMAILS).includes(email.toLowerCase())
}
```

**Plan-Auflösung** in `src/billing/plans.ts` ergänzen (rein):
```ts
export function resolvePlan(sub: { plan: Plan; status: string } | null, isComp: boolean): Plan {
  if (isComp) return 'gross'
  return effectivePlan(sub)
}
```

**`getAccountPlan(accountId)` in `src/db/repo.ts`** erweitern: zusätzlich die Account-E-Mail laden (kleiner Select) und `resolvePlan(email, sub, isCompEmail(email))` zurückgeben. Damit erhalten Comp-/Admin-Mails immer `'gross'`. Der Monitor-Toggle (nutzt `getAccountPlan`) erlaubt dann sofort 10 Domains; Stripe bleibt unberührt (Comp-Nutzer haben keine Sub und werden nie downgegradet).

> Hinweis Webhook: `enforceLimit` nutzt `effectivePlan` direkt für reale Abonnenten — Comp-Nutzer haben keine Sub, also kein Konflikt.

## Admin-Gate — `src/auth/admin.ts`

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

## Repo-Funktionen (`src/db/repo.ts`, mit LIMIT; DB-Glue, kein Unit-Test)

- `getAdminStats()` → `{ totalScans, scansToday, avgScore, totalLeads, activeSubs }` (SQL-Counts; `avgScore` = `round(avg(total))`; `activeSubs` = `count(*) where status in ('active','trialing')`; `scansToday` = `created_at >= current_date`).
- `getRecentScansWithLead(limit = 100)` → Scans (id, domain, total, createdAt, accountId) LEFT JOIN leads → erste/zugehörige Lead-E-Mail; nach createdAt desc.
- `getRecentLeads(limit = 100)` → leads JOIN scans (domain) → `{ email, domain, createdAt }`; nach createdAt desc.
- `getAccountsOverview()` → accounts LEFT JOIN subscriptions + Monitor-Count (Subquery) → `{ id, email, plan, status, monitorCount, createdAt }`; nach createdAt desc. (Effektiven Plan inkl. Comp berechnet die Seite via `isCompEmail`/`effectivePlan`.)

## Seiten & Routen

**`/admin`** (`app/admin/page.tsx`, Server Component, `runtime='nodejs'`, `force-dynamic`):
- `await requireAdmin()` zuerst.
- Lädt `getAdminStats`, `getRecentScansWithLead`, `getRecentLeads`, `getAccountsOverview` und rendert vier Blöcke (Kennzahlen-Leiste, Scans-Tabelle mit „Report öffnen"→`/report/[id]`, Leads-Tabelle, Accounts-Tabelle). Tailwind im bestehenden Stil; je Block eine schlichte Tabelle/Liste. Effektiver Plan je Account: `isCompEmail(email) ? 'gross' : effectivePlan({plan,status})`.

**`/report/[id]`** (Änderung): Eigentümer-Prüfung erweitern:
```ts
const owned = !!session && ((scan.accountId != null && scan.accountId === session.accountId) || isAdminEmail(session.email))
```
→ Admins öffnen jeden Report.

**`SiteHeader` + `app/layout.tsx`:** Layout berechnet `const session = await getSession()` (bereits vorhanden) und zusätzlich `isAdmin = !!session && isAdminEmail(session.email)`; gibt `isAdmin` an `SiteHeader`, das bei Admins einen „Admin"-Link (`/admin`) zeigt.

## Env / Setup

Neue Envs: `ADMIN_EMAILS`, `COMP_EMAILS` (komma-separierte Mail-Listen). In `docker-compose.yml` ergänzen und in der VPS-Projekt-Env setzen. Für die Demo: deine Mail in `ADMIN_EMAILS`, Kollegen-Mails in `COMP_EMAILS`. Fehlen die Envs → niemand ist Admin/Comp (sicherer Default: kein Admin-Zugang, alle 'free').

## Fehlerbehandlung

- `/admin` und Report-Admin-Bypass: kein Session/kein Admin → Redirect `/login` (keine Datenpreisgabe). `redirect()` außerhalb try/catch.
- Admin-Queries sind read-only; Fehler propagieren als 500 (kein Datenleck).
- Leere Listen → freundliche Leerzustände.

## Tests (Vitest, rein)

`tests/access.test.ts`:
- `isAdminEmail`: Treffer/kein Treffer, case-insensitive, getrimmt, leere/fehlende Env → false.
- `isCompEmail`: Treffer in COMP; Admin ist automatisch Comp; sonst false.
- `resolvePlan`: `isComp=true` → 'gross' (auch ohne Sub / bei canceled Sub); `isComp=false` → delegiert an `effectivePlan` (active→plan, sonst free).

Admin-Seite/Repo/Report-Änderung: `tsc` + `build` + manueller Login-Smoke (Admin sieht /admin; Nicht-Admin → /login).

## Deployment

Teil des 4c-Deploys (bzw. direkt danach): Push `master` → Build → `VPS_updateProjectV1`. `ensureSchema()` unverändert (keine neuen Tabellen). **Envs `ADMIN_EMAILS`/`COMP_EMAILS` in der VPS-Projekt-Env setzen** (sonst kein Admin/Comp). Für die Demo genügt das — Stripe muss dafür NICHT eingerichtet sein, weil Comp den Plan ohne Stripe auf 'gross' hebt.

## Modul-Struktur

- **Neu:** `src/billing/access.ts` (rein), `src/auth/admin.ts`, `tests/access.test.ts`, `app/admin/page.tsx`.
- **Geändert:** `src/billing/plans.ts` (+`resolvePlan`), `src/db/repo.ts` (+Admin-Queries; `getAccountPlan` mit Comp), `app/report/[id]/page.tsx` (Admin-Bypass), `app/layout.tsx` (+`isAdmin`), `components/SiteHeader.tsx` (+Admin-Link), `docker-compose.yml` (+`ADMIN_EMAILS`/`COMP_EMAILS`).

## Offene Folge-Punkte (nicht 4f)

- 4c live nehmen (Stripe-Setup) — separat.
- 4b: `MONITORING_SECRET` am VPS.
- 4d (Auto-Brand-Visibility), 4e (PDF-Export).
- Sicherheit: `GET /api/scan/[id]` Enumeration (Spawn-Task).
- Optional später: CSV-Export im Admin, Pagination, Such-/Filterfelder.
