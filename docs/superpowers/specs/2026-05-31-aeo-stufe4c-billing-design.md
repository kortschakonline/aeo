# AEO-Tool — Stufe 4c: Abo/Billing (Design)

**Datum:** 2026-05-31
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Vorgänger:** MVP, Stufe 2 (KI-Analyse), Stufe 3 (Brand-Visibility), **4a (Accounts+Dashboard)**, **4b (Monitoring)** — alle live unter https://aeo.kortschak.online

## Kontext & Abgrenzung

Teil 3 des Self-Service-SaaS. **4c liefert die Abo-Maschinerie + Tier-Gating** — die zahlbare Paywall. Die zwei Premium-Extras des Groß-Tiers werden als eigene Folge-Specs gebaut:
- **4d (später):** Auto-Brand-Visibility im Monitoring-Lauf (Groß).
- **4e (später):** PDF-Export je Report (Groß).

**Geschäftsmodell-Kontext:** Der anonyme Schnupper-Scan bleibt der **Lead-Magnet** fürs Kerngeschäft (Done-for-you-AEO der Werbeagentur, Hauptumsatz). Das Abo ist Zusatz-/Self-Service-Umsatz und gated den *wiederkehrenden* Wert (Monitoring), nicht den Erst-Scan.

## Locked-in Entscheidungen (Brainstorming 2026-05-31)

**Tiers (monatlich, Brutto-Positionierung in der UI):**

| Feature | Gratis | Klein €19/M | Groß €49/M |
|---|---|---|---|
| Anonymer Schnupper-Scan (Lead-Magnet) | ✓ | ✓ | ✓ |
| Konto + Scan-Verlauf | ✓ | ✓ | ✓ |
| Überwachte Domains (Monitoring) | **0** | **1** | **bis 10** |
| Monitoring-Takt | – | wöchentlich | wöchentlich |
| Auto-Brand-Visibility im Lauf | – | – | ✓ *(4d)* |
| PDF-Export | – | – | ✓ *(4e)* |

- **Free-Grenze (Option 1):** anonymer Scan + Voll-Report-nach-E-Mail bleiben gratis und unverändert. Abo gated Monitoring/Export/Auto-Brand. Gratis-Konto = 0 Monitore.
- **Stripe-Architektur (A):** Stripe **Checkout** (gehostet) + **Customer Portal** (gehostet) + **Webhooks** als Wahrheit. PCI bei Stripe.
- **Nur monatlich.** Keine Trials/Coupons/Jahres-Abos in 4c.

## Bestehende Architektur (Ausgangspunkt)

- Next.js 16 + Postgres (Drizzle/postgres-js) + Playwright, ein App-Container hinter Traefik. Deploy: GitHub Actions → GHCR → `VPS_updateProjectV1` (pull+recreate). Compose auf dem VPS; Env als VPS-Projekt-Env.
- `accounts` (id, email, …), `sessions`, `monitors` (id, account_id, domain, url, active, last_run_at, last_score, createdAt; UNIQUE(account_id,domain)).
- `getSession()` → `{accountId, email}|null`. Monitor-Toggle `app/api/monitoring/toggle/route.ts` nutzt aktuell die Konstante `MAX_MONITORS=3` (`src/monitoring/constants.ts`) — wird ersetzt.
- `deleteAccount(accountId, email)` in `src/db/repo.ts` löscht bereits sessions/login_tokens/leads/monitors + nullt scans.
- Mailer-Muster + idempotentes `ensureSchema()`. Fail-closed-Muster aus 4b (503 bei fehlender Secret-Env).
- **Next.js 16:** Route Handler `req.text()` liefert den **rohen** Body (für Stripe-Signaturprüfung); `cookies()` async; `redirect()` außerhalb try/catch. Vitest `node`-Env **ohne DB/Netz** → nur reine Logik unit-getestet.

## Datenmodell

Neue Tabelle (max. eine Zeile pro Account; Gratis-Accounts haben **keine** Zeile):
```
subscriptions
  id                      serial PRIMARY KEY
  account_id              integer NOT NULL REFERENCES accounts(id)
  stripe_customer_id      text NOT NULL
  stripe_subscription_id  text
  plan                    text NOT NULL          -- 'klein' | 'gross'
  status                  text NOT NULL          -- Stripe: active|trialing|past_due|canceled|unpaid|incomplete…
  current_period_end      timestamp
  updated_at              timestamp DEFAULT now() NOT NULL
```
Idempotent in `ensureSchema()` + `CREATE UNIQUE INDEX subscriptions_account_idx ON subscriptions(account_id)` + Index auf `stripe_customer_id`. Drizzle-Tabelle in `src/db/schema.ts`.

## Reine Plan-Logik — `src/billing/plans.ts` (unit-getestet)

```ts
export type Plan = 'free' | 'klein' | 'gross'

export const PLAN_LIMITS: Record<Plan, { monitors: number; autoBrand: boolean; export: boolean }> = {
  free:  { monitors: 0,  autoBrand: false, export: false },
  klein: { monitors: 1,  autoBrand: false, export: false },
  gross: { monitors: 10, autoBrand: true,  export: true },
}

const ACTIVE_STATUSES = ['active', 'trialing']

export function effectivePlan(sub: { plan: Plan; status: string } | null): Plan {
  if (!sub) return 'free'
  return ACTIVE_STATUSES.includes(sub.status) ? sub.plan : 'free'
}

export function monitorLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].monitors
}

/** Beim Downgrade/Kündigen: IDs der abzuschaltenden Monitore (älteste `limit` bleiben aktiv). */
export function monitorsToDeactivate(
  monitors: { id: number; createdAt: Date }[],
  limit: number,
): number[] {
  const sorted = [...monitors].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return sorted.slice(limit).map((m) => m.id)
}
```

**Price-ID → Plan** in `src/billing/config.ts` (env-abhängig, daher separat):
```ts
import type { Plan } from '@/src/billing/plans'
export function planForPriceId(priceId: string, env = process.env): Plan | null {
  if (priceId === env.STRIPE_PRICE_KLEIN) return 'klein'
  if (priceId === env.STRIPE_PRICE_GROSS) return 'gross'
  return null
}
export function priceIdForPlan(plan: 'klein' | 'gross', env = process.env): string | undefined {
  return plan === 'klein' ? env.STRIPE_PRICE_KLEIN : env.STRIPE_PRICE_GROSS
}
```

## Stripe-Client — `src/billing/stripe.ts`

```ts
import Stripe from 'stripe'
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  return key ? new Stripe(key) : null
}
```
Neue Dependency `stripe`. Billing-Routen, die `getStripe()` null erhalten → `503` (fail-closed).

## Repo-Funktionen (`src/db/repo.ts`)

- `getSubscription(accountId)` → Zeile oder null.
- `getSubscriptionByCustomerId(stripeCustomerId)` → Zeile oder null (für Webhook).
- `upsertSubscription(accountId, { stripeCustomerId, stripeSubscriptionId, plan, status, currentPeriodEnd })` → insert/onConflictDoUpdate(account_id).
- `getAccountPlan(accountId)` → `effectivePlan(getSubscription(...))`.
- `deactivateMonitors(ids: number[])` → setzt active=false für die IDs (no-op bei leerem Array).
- `deleteAccount` erweitern: `subscriptions`-Zeile des Accounts löschen (FK), **bevor** der Account gelöscht wird.

## Routen

**`POST /api/billing/checkout`** (Login; `runtime='nodejs'`):
- `getStripe()` null → 503. Body `{ plan: 'klein'|'gross' }` (Zod) → sonst 400.
- Customer holen-oder-anlegen: vorhandene `subscriptions.stripe_customer_id` wiederverwenden; sonst `stripe.customers.create({ email })`.
- **Zeile sofort persistieren** (schließt Webhook-Reihenfolge-Lücke): `upsertSubscription(accountId, { stripeCustomerId, stripeSubscriptionId: null, plan, status: 'incomplete', currentPeriodEnd: null })`. Damit existiert die Zeile mit Customer-ID, bevor irgendein `customer.subscription.*`-Webhook eintrifft — `getSubscriptionByCustomerId` findet den Account zuverlässig. `effectivePlan` behandelt `incomplete` als `free`, gewährt also noch nichts.
- `stripe.checkout.sessions.create({ mode:'subscription', line_items:[{price: priceIdForPlan(plan), quantity:1}], customer, client_reference_id: String(accountId), success_url: <base>/dashboard?upgraded=1, cancel_url: <base>/pricing })`.
- Antwort `{ url: session.url }`. (Base-URL wie in 4a aus `APP_BASE_URL`/Forward-Headern.)

**`POST /api/billing/portal`** (Login; `runtime='nodejs'`):
- `getStripe()` null → 503. `getSubscription(accountId)` ohne Customer-ID → 400.
- `stripe.billingPortal.sessions.create({ customer, return_url: <base>/dashboard })` → `{ url }`.

**`POST /api/billing/webhook`** (kein Login; `runtime='nodejs'`):
- `getStripe()` null oder `STRIPE_WEBHOOK_SECRET` fehlt → 503.
- `const raw = await req.text(); const sig = req.headers.get('stripe-signature')`; `stripe.webhooks.constructEvent(raw, sig, secret)` → bei Fehler 400.
- Events:
  - `checkout.session.completed`: `session.client_reference_id` = accountId; `subscription` laden (`stripe.subscriptions.retrieve`), Plan aus `planForPriceId(item.price.id)`; `upsertSubscription(accountId, {...status, current_period_end, customer, subscription})`.
  - `customer.subscription.updated` / `customer.subscription.deleted`: Account via `getSubscriptionByCustomerId(customer)`; Plan aus Price (bei deleted → status 'canceled'); `upsertSubscription`; danach **Limit durchsetzen**: `monitorsToDeactivate(monitorsOfAccount, monitorLimit(effectivePlan(...)))` → `deactivateMonitors(ids)`.
  - sonst: 200 (ignorieren).
- Antwort 200 `{ received: true }`.

## Gating-Durchsetzung (genau zwei Stellen; Run-Endpoint unverändert)

1. **`app/api/monitoring/toggle/route.ts`**: Import von `MAX_MONITORS` entfernen; Limit = `monitorLimit(await getAccountPlan(session.accountId))`. Gratis (0) → Aktivieren → `409 { error: 'Abo erforderlich', upgrade: true }`. Klein 1, Groß 10. (Deaktivieren bleibt immer erlaubt.)
2. **Webhook** bei `subscription.updated/deleted`: überzählige Monitore via `monitorsToDeactivate` abschalten (Kündigung→free→alle aus; Groß→Klein→alle außer ältestem). So bleibt kein über-limitiger Monitor aktiv, ohne den Wochenlauf zu ändern.

`src/monitoring/constants.ts`: `MAX_MONITORS` wird nicht mehr verwendet — entfernen (oder belassen falls anderswo referenziert; vorher prüfen). `MONITOR_INTERVAL_DAYS`/`MONITOR_RUN_CAP` bleiben.

## UI

- **`/pricing`** (öffentliche Server-Seite): drei Tier-Karten (Gratis / Klein €19 / Groß €49, „pro Monat"), Feature-Liste je Tier. CTA: eingeloggt → Client-`UpgradeButton` (`POST /api/billing/checkout` → redirect zu `url`); anonym → Link `/login`. Hinweis „inkl. USt" / Preisangabe sauber.
- **`SiteHeader`**: „Preise"-Link (immer sichtbar).
- **Dashboard** (`/dashboard`): Plan-Badge im Kopf (aus `getAccountPlan`). `AccountMenu` bekommt „Upgraden" (→ `/pricing`) und — wenn `getSubscription` vorhanden — „Abo verwalten" (`POST /api/billing/portal` → redirect). `MonitorToggle`: bei `409` Text „Abo erforderlich" + Link `/pricing`. Optionaler `?upgraded=1`-Erfolgshinweis.
- **`components/UpgradeButton.tsx`** + **`components/ManageBillingButton.tsx`** (Client; fetch → `window.location.href = url`).

## Env / Stripe-Setup (einmalig, manuell)

- Stripe-Dashboard: zwei Produkte „AEO Klein" / „AEO Groß", je monatlicher Preis €19 / €49 → Price-IDs.
- Webhook-Endpoint `https://aeo.kortschak.online/api/billing/webhook` registrieren (Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`) → Webhook-Secret.
- Neue Envs (VPS-Projekt-Env + `docker-compose.yml` + lokal): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_KLEIN`, `STRIPE_PRICE_GROSS`.

## Fehlerbehandlung

- Billing-Routen fail-closed: kein Stripe-Key / Webhook-Secret → 503. Webhook ungültige Signatur → 400.
- Checkout/Portal-Aufrufe in try/catch; Stripe-Fehler → 502/500 mit generischer Meldung, Detail geloggt.
- Webhook ist idempotent (upsert nach account_id); Stripe liefert ggf. mehrfach.
- Plan-Resolution defensiv: unbekannter/abgelaufener Status → `free` (kein versehentliches Gewähren).

## Tests (Vitest, rein)

`tests/billing.test.ts`:
- `effectivePlan`: kein Sub → free; status active/trialing → plan; canceled/past_due/incomplete → free.
- `monitorLimit`: free 0, klein 1, gross 10.
- `monitorsToDeactivate`: über Limit → älteste behalten, Rest IDs; free(0) → alle; unter Limit → leer.
- `planForPriceId`/`priceIdForPlan`: via injizierter Env-Map korrekt; unbekannte Price → null.

Stripe-/Webhook-/Route-Glue: `tsc` + `build` + manueller Test mit Stripe-CLI (`stripe listen --forward-to …/api/billing/webhook`, `stripe trigger checkout.session.completed`).

## Recht

- `/datenschutz`: Abschnitt „Zahlungsabwicklung" — Stripe als Auftragsverarbeiter, Übermittlung von Zahlungs-/Rechnungsdaten an Stripe.
- **Juristischer Folgepunkt (kein Code, blockiert 4c nicht):** Verkauf an Verbraucher in AT erfordert AGB, Widerrufsbelehrung, korrekte Preisangaben (Brutto/USt). Vor Live-Vermarktung der Abos prüfen lassen.

## Deployment

Wie etabliert (Push→Actions→Image→`VPS_updateProjectV1`). **Einmalig:** Stripe-Produkte/Preise + Webhook anlegen; die vier `STRIPE_*`-Envs in der VPS-Projekt-Env setzen; mit Stripe-Test-Keys end-to-end durchspielen (Checkout→Webhook→Plan aktiv→Toggle erlaubt; Portal-Kündigung→Monitore aus), dann auf Live-Keys umstellen. `ensureSchema()` legt `subscriptions` beim ersten Zugriff an.

## Modul-Struktur

- **Neu:** `src/billing/plans.ts` (rein), `src/billing/config.ts`, `src/billing/stripe.ts`, `tests/billing.test.ts`, `app/api/billing/checkout/route.ts`, `app/api/billing/portal/route.ts`, `app/api/billing/webhook/route.ts`, `app/pricing/page.tsx`, `components/UpgradeButton.tsx`, `components/ManageBillingButton.tsx`.
- **Geändert:** `src/db/schema.ts` (+subscriptions), `src/db/migrate.ts` (+subscriptions), `src/db/repo.ts` (+Subscription-Funktionen, deleteAccount erweitert), `app/api/monitoring/toggle/route.ts` (Plan-Limit statt Konstante), `app/dashboard/page.tsx` (Plan-Badge + Buttons), `components/AccountMenu.tsx` (Upgrade/Verwalten), `components/MonitorToggle.tsx` (409-Text), `components/SiteHeader.tsx` (Preise-Link), `app/datenschutz/page.tsx` (Stripe), `docker-compose.yml` (+STRIPE_*-Envs), `package.json` (+stripe).

## Offene Folge-Punkte (nicht 4c)

- 4d Auto-Brand-Visibility im Monitoring (Groß).
- 4e PDF-Export (Groß).
- Recht: AGB + Widerruf + Brutto-Preisangaben (juristisch).
- Sicherheit (aus 4a): `GET /api/scan/[id]` + `/api/scan/[id]/brand` ohne Zugriffsschutz (eigener Spawn-Task).
- Monitoring: `MONITORING_SECRET` auf dem VPS setzen (4b-Restschritt).
