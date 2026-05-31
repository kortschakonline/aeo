# AEO-Tool — Stufe 4b: Monitoring (Design)

**Datum:** 2026-05-31
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Vorgänger:** MVP, Stufe 2 (KI-Analyse), Stufe 3 (Brand-Visibility), **Stufe 4a (Accounts + Dashboard)** — alle live unter https://aeo.kortschak.online

## Kontext & Abgrenzung

Teil 2 des Self-Service-SaaS. Reihenfolge: **4a Accounts+Dashboard (live)** → **4b Monitoring** (dieser Spec) → **4c Abo/Billing** (später).

4b fügt **automatische wöchentliche Re-Scans** für vom Nutzer gewählte Domains hinzu und schickt eine **E-Mail bei Score-Änderung**. Es baut direkt auf 4a auf (Accounts, Sessions, `scans.account_id`, Dashboard nach Domain gruppiert).

**Bewusst NICHT in 4b:** wählbare Intervalle (nur fester Wochentakt), Tier-Limits/Billing (4c), Alerts auf Einzel-Check-Ebene (nur Gesamt-Score), separater Worker-Container.

## Locked-in Entscheidungen (Brainstorming 2026-05-31)

1. **Opt-in & Takt:** Pro Domain ein Toggle im Dashboard; aktive Domains werden **1×/Woche** automatisch neu gescannt.
2. **Alert:** E-Mail **nur bei Änderung des Gesamt-Scores** gegenüber dem letzten überwachten Lauf (mit Richtung ↑/↓). Kein Wechsel → keine Mail. Erstlauf setzt nur die Baseline (kein Alert).
3. **Limit:** **max. 3 aktive Monitoring-Domains pro Account** (zentrale Konstante `MAX_MONITORS`, in 4c via Tiers anhebbar).
4. **Scheduling:** Geschützter Endpoint `POST /api/monitoring/run`, wöchentlich von einem **GitHub-Actions-Cron** getriggert (plus manueller `workflow_dispatch`).
5. **Lauf-Umfang:** nur `runScan` (Technik+Content) — **kein Claude** (KI-Analyse/Brand beeinflussen den Score nicht; bleiben on-demand im Report).

## Bestehende Architektur (Ausgangspunkt)

- Next.js 16 + Postgres (Drizzle/postgres-js) + Playwright, **ein** App-Container (`next start`) + `postgres:16`, hinter Traefik. Deploy: GitHub Actions baut Image → GHCR → `VPS_updateProjectV1` (pull+recreate, kein Build auf dem VPS). Compose liegt auf dem VPS.
- `runScan(input, deps?)` in `src/engine/scan.ts` orchestriert Render+Fetch+Checks+Scoring und liefert `ScanResult` (`url, domain, total, categories, checks, contentExcerpt`).
- `saveScan(result, accountId?)` schreibt nach `scans` (4a: optionale `accountId`). `getAccountScans(accountId)` liefert die Historie.
- Schema idempotent via `ensureSchema()` in `src/db/migrate.ts`. Mailversand via `src/mail/notifier.ts` (gemeinsamer `createTransport`-Helfer, SMTP-Env vorhanden).
- Session: `getSession()` in `src/auth/session.ts`.
- **Next.js 16:** async `cookies()`, `redirect()` aus `next/navigation` außerhalb try/catch, Route Handler mit Web `Request`/`Response`. Tests: Vitest `node`-Env **ohne DB** → nur reine Logik bekommt Unit-Tests.

## Datenmodell

Eine neue Tabelle. Scan-Ergebnisse brauchen **keine** neue Tabelle — Monitoring-Läufe schreiben über `saveScan` nach `scans` und erscheinen damit automatisch im Dashboard-Verlauf.

```
monitors
  id           serial PK
  account_id   integer NOT NULL REFERENCES accounts(id)
  domain       text NOT NULL
  url          text NOT NULL          -- canonical URL zum Re-Scannen (Snapshot der zuletzt gescannten URL der Domain)
  active       boolean NOT NULL DEFAULT true
  last_run_at  timestamp              -- NULL = vom Monitor noch nie gelaufen
  last_score   integer                -- Score beim letzten Monitor-Lauf (Änderungserkennung)
  created_at   timestamp DEFAULT now() NOT NULL
  UNIQUE(account_id, domain)
```

Idempotent in `ensureSchema()` (`CREATE TABLE IF NOT EXISTS` + Indizes), plus:
- `CREATE UNIQUE INDEX … monitors_account_domain ON monitors(account_id, domain)`
- `CREATE INDEX … monitors_due_idx ON monitors(active, last_run_at)`

Drizzle-Tabelle in `src/db/schema.ts` ergänzen (`boolean` aus `drizzle-orm/pg-core` importieren).

## Kernlogik (rein, testbar) — `src/monitoring/logic.ts`

- `isDue(monitor, now): boolean` → `monitor.active && (monitor.lastRunAt == null || monitor.lastRunAt < now − 7 Tage)`.
- `scoreChange(oldScore: number | null, newScore: number): { changed: boolean; direction: 'up' | 'down' | 'none' }` → `changed = oldScore != null && newScore !== oldScore`; `direction` = up/down/none. Bei `oldScore == null` (Erstlauf): `changed=false` (nur Baseline).
- `canEnable(activeCount: number, max: number, alreadyActive: boolean): boolean` → `alreadyActive || activeCount < max`.

Konstante `MAX_MONITORS = 3` in `src/monitoring/constants.ts`.

## Repo-Funktionen (in `src/db/repo.ts`)

- `getMonitorsForAccount(accountId)` → alle Monitore des Accounts (für Dashboard-Toggle-Zustände).
- `countActiveMonitors(accountId)` → Anzahl aktiver Monitore.
- `upsertMonitor(accountId, domain, url, active)` → anlegen/aktualisieren (UNIQUE account_id+domain); setzt `active` und (bei Neuanlage) `url`.
- `getActiveMonitorsWithEmail()` → alle Monitore mit `active = true`, **gejoint mit `accounts`** (liefert `id, accountId, domain, url, lastRunAt, lastScore, email`), sortiert nach `last_run_at` ASC (NULLs zuerst). Die „fällig"-Auswahl macht der Run-Endpoint anschließend mit `isDue` (einzige Quelle der Regel, unit-getestet) und kappt bei CAP. Bei aktueller Größe (max. 3/Account) ist das Laden aller aktiven Monitore unproblematisch.
- `recordMonitorRun(monitorId, score)` → `last_run_at = now()`, `last_score = score`.
- `latestScanUrlForDomain(accountId, domain)` → URL des neuesten Scans dieser Domain des Accounts (für die Monitor-`url` beim Aktivieren).

## Routen

**`POST /api/monitoring/run`** (Maschinen-Endpoint, kein Login; `runtime='nodejs'`, großzügige `maxDuration`):
1. Env `MONITORING_SECRET` fehlt → `503` (Fail-closed, nicht versehentlich offen).
2. Header `Authorization: Bearer <secret>` ≠ Env → `401`.
3. `getActiveMonitorsWithEmail()`; `due = active.filter(m => isDue(m, now))`; `batch = due.slice(0, CAP)` (CAP z. B. 25).
4. Pro Monitor in `batch` sequenziell, in `try/catch` je Domain:
   - `result = runScan(monitor.url)` → `saveScan(result, monitor.accountId)`.
   - `scoreChange(monitor.lastScore, result.total)`; bei `changed` → `sendMonitoringAlert(monitor.email, domain, monitor.lastScore, result.total)` (E-Mail kommt aus dem Join).
   - `recordMonitorRun(monitor.id, result.total)`.
   - Fehler werden gefangen + geloggt (Batch läuft weiter), Zähler `errors++`.
5. Antwort `{ checked, alerted, errors, capped }` (`capped = due.length > CAP`).

**`POST /api/monitoring/toggle`** (Login via `getSession()`; `runtime='nodejs'`):
- Body `{ domain: string, active: boolean }` (Zod).
- Beim Aktivieren: `countActiveMonitors`; `canEnable(count, MAX_MONITORS, bereitsAktiv)` → sonst `409 { error: 'Limit erreicht' }`.
- URL = `latestScanUrlForDomain(accountId, domain)`; existiert keine → `400` (nichts zu überwachen).
- `upsertMonitor(accountId, domain, url, active)` → `{ ok: true, active }`.
- Nur Domains des eigenen Accounts (URL-Lookup ist accountgebunden) → keine Fremd-Domains aktivierbar.

## Scheduling — GitHub Actions

`.github/workflows/monitoring.yml`:
- `on: schedule: - cron: '0 5 * * 1'` (Montag 05:00 UTC) **und** `workflow_dispatch`.
- Ein Job/Step: `curl -fsS -X POST https://aeo.kortschak.online/api/monitoring/run -H "Authorization: Bearer ${{ secrets.MONITORING_SECRET }}"`. `-f` lässt den Job bei HTTP≠2xx fehlschlagen (Sichtbarkeit).

## Alert-Mail — `src/mail/notifier.ts`

`sendMonitoringAlert(email, domain, oldScore, newScore)` (nutzt vorhandenen `createTransport`): deutscher Text, Richtung ↑/↓ aus dem Vergleich, Link auf `…/dashboard`. Betreff: `AEO-Score für ${domain}: ${oldScore} → ${newScore}`. Kein SMTP konfiguriert → `console.warn` + return (wie bestehende Mailer).

## Dashboard-UI

- `/dashboard` (Server Component) lädt zusätzlich `getMonitorsForAccount(accountId)` und gibt pro Domain den Zustand (`active`, `lastRunAt`) an einen neuen Client-Toggle.
- `components/MonitorToggle.tsx` (Client): zeigt „Monitoring: An/Aus" + Status („wöchentlich · zuletzt geprüft {Datum}" bzw. „aus"). Klick → `POST /api/monitoring/toggle` `{domain, active}`; bei `409` dezenter Hinweis „Limit erreicht (max. 3)"; danach `router.refresh()`.
- Platzierung in der bestehenden Domain-Sektion (neben Sparkline/RescanButton). Bestehendes Dashboard-Layout bleibt erhalten.

## Env / Secret

Neue Variable **`MONITORING_SECRET`** an zwei Stellen:
1. **VPS-Projekt-Env** (Endpoint-Validierung) — muss real gesetzt sein, sonst `503` und Monitoring läuft nicht.
2. **GitHub-Repo-Secret** (Actions sendet sie).

`docker-compose.yml` im Repo wird um `- MONITORING_SECRET=${MONITORING_SECRET}` ergänzt (Doku/Konsistenz); die Compose auf dem VPS ist separat und muss dort entsprechend gesetzt werden.

## Fehlerbehandlung

- Run-Endpoint: pro Domain isoliertes try/catch; ein Fehler killt den Batch nicht. Fehlende/falsche Auth → 401/503. Mail-Fehler werden geloggt, brechen den Lauf nicht ab.
- Toggle: ungültiger Body → 400; Limit → 409; keine Scan-URL → 400; kein Login → 401.
- `runScan`-Fehler eines Monitors → geloggt, `errors++`, `last_run_at` wird in diesem Fall NICHT gesetzt (damit die Domain beim nächsten Lauf erneut versucht wird).

## Tests (Vitest, rein)

`tests/monitoring.test.ts`:
- `isDue`: nie gelaufen (due), frisch gelaufen (<7d, nicht due), überfällig (>7d, due), inaktiv (nicht due).
- `scoreChange`: gleich (none/!changed), höher (up/changed), niedriger (down/changed), Baseline `null` (none/!changed).
- `canEnable`: unter Limit (true), am Limit & neu (false), am Limit & bereits aktiv (true).

DB-/Route-/Playwright-Glue: `npx tsc --noEmit` + `npm run build` + manueller curl-Smoke des Endpoints mit Secret.

## Datenschutz

Kurzer Zusatz in `/datenschutz`: Bei aktivem Monitoring werden die gewählten Domains regelmäßig (wöchentlich) automatisch erneut gescannt; bei Änderung des Scores senden wir eine E-Mail an die Konto-Adresse. Deaktivierung jederzeit im Dashboard.

## Deployment

Wie etabliert (Push→Actions→Image→`VPS_updateProjectV1`). **Einmalig zusätzlich:** `MONITORING_SECRET` in VPS-Projekt-Env **und** als GitHub-Repo-Secret setzen; `monitoring.yml`-Workflow zuerst manuell via `workflow_dispatch` testen, dann dem Wochen-Cron überlassen. `ensureSchema()` legt `monitors` beim ersten Zugriff an.

## Modul-Struktur (Zusammenfassung)

- **Neu:** `src/monitoring/logic.ts` (rein), `src/monitoring/constants.ts`, `tests/monitoring.test.ts`, `app/api/monitoring/run/route.ts`, `app/api/monitoring/toggle/route.ts`, `components/MonitorToggle.tsx`, `.github/workflows/monitoring.yml`.
- **Geändert:** `src/db/schema.ts` (+monitors), `src/db/migrate.ts` (+monitors), `src/db/repo.ts` (+Monitor-Funktionen), `src/mail/notifier.ts` (+sendMonitoringAlert), `app/dashboard/page.tsx` (+Monitor-Zustände & Toggle), `app/datenschutz/page.tsx` (+Abschnitt), `docker-compose.yml` (+Env).

## Offene Folge-Punkte (nicht 4b)

- 4c Abo/Billing (Stripe, Tier-Gating, `MAX_MONITORS` pro Tier, ggf. tägliche Intervalle).
- Sicherheit (aus 4a): `GET /api/scan/[id]` + `/api/scan/[id]/brand` ohne Zugriffsschutz (eigener Spawn-Task).
