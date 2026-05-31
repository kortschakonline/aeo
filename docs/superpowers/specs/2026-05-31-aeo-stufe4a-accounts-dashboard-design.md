# AEO-Tool — Stufe 4a: Accounts + Dashboard (Design)

**Datum:** 2026-05-31
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Vorgänger:** MVP, Stufe 2 (KI-Analyse), Stufe 3 (Brand-Visibility) — alle live unter https://aeo.kortschak.online

## Kontext & Abgrenzung

„Stufe 4" (das Self-Service-SaaS) wird in drei eigene Spec→Plan→Bau-Zyklen zerlegt:

- **4a — Accounts + Dashboard** ← *dieser Spec*
- **4b — Monitoring** (geplante Re-Scans / Cron, Trend-Tracking, Alerts) — später, eigener Spec
- **4c — Abo/Billing** (Stripe, Tier-Gating) — zuletzt, eigener Spec

Diese Reihenfolge folgt der Projektentscheidung „Start mit Done-for-you-Service, Abo später ohne Umbau". 4a liefert sofortigen Nutzwert (Login + Scan-Verlauf) ohne Zahlungs-Komplexität und legt das Fundament, auf dem 4b/4c aufsetzen.

**Bewusst NICHT in 4a:** Bezahl-Tiers/Limits (4c), automatisches Monitoring/Cron + Alerts (4b). 4a ist für eingeloggte Nutzer frei & unbegrenzt; ein einfaches Rate-Limit beugt Missbrauch vor.

## Bestehende Architektur (Ausgangspunkt)

- Next.js 16 + Postgres (Drizzle) + Playwright, Docker-Image via GitHub Actions → Hostinger-VPS hinter Traefik.
- DB heute: `scans` (inkl. `ai_analysis`, `brand_visibility` jsonb) und `leads` (`email` + `scan_id`). Kein Auth, kein User-Begriff.
- Routen heute alle anonym: `/api/scan`, `/api/scan/[id]`, `/api/scan/[id]/brand`, `/api/lead`.
- Schema wird idempotent in `src/db/migrate.ts` `ensureSchema()` erzeugt (kein manuelles `drizzle-kit push`).
- SMTP aktiv (Hostinger, Absender mail@kortschak.online).
- **Wichtig (AGENTS.md):** Next.js 16 weicht ggf. von Trainingswissen ab — exakte APIs (Route Handler, `cookies()`, Redirect, Server Components) vor der Implementierung gegen `node_modules/next/dist/docs/` prüfen.

## Locked-in Entscheidungen (aus Brainstorming 2026-05-31)

1. **Auth:** Passwortloser **Magic-Link**. Kein Passwort, kein Reset-Flow, nutzt vorhandenes SMTP.
2. **Session:** **DB-Session-Token im HttpOnly-Cookie** (Sessions-Tabelle in Postgres, serverseitig widerrufbar, keine Krypto-Bibliothek).
3. **Leads ↔ Accounts:** **Rückwirkend per E-Mail.** Account = E-Mail. Beim ersten Login gehören dem Nutzer alle Scans, die je mit dieser E-Mail freigeschaltet wurden, plus alle künftigen.
4. **Dashboard-Umfang:** Verlauf (nach Domain gruppiert) + manueller Re-Scan + einfacher Score-Verlauf pro Domain.
5. **Account-Löschung:** In 4a enthalten (DSGVO-Löschrecht).

## Datenmodell

Drei neue Tabellen + eine neue Spalte an `scans`. Alles idempotent in `ensureSchema()` (gleiches Muster wie heute: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Drizzle-Schema in `src/db/schema.ts` ergänzen.

```
accounts
  id            serial PK
  email         text UNIQUE NOT NULL      -- Identität
  created_at    timestamp DEFAULT now() NOT NULL
  last_login_at timestamp

login_tokens                              -- Magic-Link, kurzlebig
  id          serial PK
  email       text NOT NULL
  token_hash  text NOT NULL               -- sha256(token); Klartext nur in der Mail-URL
  expires_at  timestamp NOT NULL          -- 15 Minuten
  used_at     timestamp                   -- Einmal-Nutzung (NULL = ungenutzt)
  created_at  timestamp DEFAULT now() NOT NULL

sessions                                  -- langlebig
  id           serial PK
  account_id   integer NOT NULL REFERENCES accounts(id)
  token_hash   text NOT NULL              -- sha256(token); Klartext nur im Cookie
  expires_at   timestamp NOT NULL         -- 30 Tage, gleitend
  created_at   timestamp DEFAULT now() NOT NULL
  last_seen_at timestamp

scans
  + account_id integer NULL REFERENCES accounts(id)   -- neu, nullable
```

### Verknüpfungslogik („rückwirkend per E-Mail")

- Beim **ersten Login** mit E-Mail X: einmaliger **Backfill** — alle `scans`, die über `leads` (`leads.email = X`) verknüpft sind, erhalten `scans.account_id = <neue accountId>`.
- Danach ist **`scans.account_id` die alleinige Eigentümer-Quelle** → einfache, schnelle Dashboard-Queries.
- **Künftige Scans im eingeloggten Zustand** setzen `account_id` direkt und **überspringen das E-Mail-Gate** (E-Mail bereits bekannt).
- `leads` bleibt unverändert: anonymer Funnel + historische Backfill-Quelle.

## Auth-Flow

1. Nutzer öffnet `/login`, gibt E-Mail ein → `POST /api/auth/request`.
2. Server erzeugt `login_token` (Hash gespeichert), schickt Magic-Link `…/api/auth/callback?token=<klartext>` per Mail. Antwort **immer 200** (keine Account-Enumeration).
3. Klick auf den Link → `GET /api/auth/callback`: Token prüfen (existiert, nicht abgelaufen, nicht benutzt). Bei Erfolg: Token als benutzt markieren, Account anlegen-falls-neu, beim ersten Mal Backfill, Session anlegen, HttpOnly-Cookie setzen, `last_login_at` aktualisieren, Redirect → `/dashboard`.
4. `POST /api/auth/logout` → Session-Zeile löschen, Cookie leeren.

## Routen & Module

**Neue Routen:**
- `POST /api/auth/request` — `{ email }` → Token + Mail. Immer 200. Rate-Limit pro E-Mail/IP.
- `GET /api/auth/callback?token=…` — verifiziert, setzt Session-Cookie, Redirect `/dashboard`. Ungültig/abgelaufen → Redirect `/login?error=…`.
- `POST /api/auth/logout` — Logout.
- `POST /api/account/delete` — (eingeloggt) Account löschen (siehe DSGVO).

**Neue Seiten:**
- `/login` — E-Mail-Formular + „Mail verschickt"-Bestätigung.
- `/dashboard` — Server Component, liest Session, listet Domains + Scans.

**Erweiterte Routen:**
- `/api/scan` & `/api/lead` — wenn Session vorhanden: `account_id` anhängen; Gate überspringen.

**Neue Module:**
- `src/auth/tokens.ts` — Token erzeugen/hashen/verifizieren (login + session), gemeinsame Krypto-Helfer (`crypto.randomBytes`, sha256).
- `src/auth/session.ts` — `getSession()` (Cookie → Session+Account inkl. Ablaufprüfung & gleitender Verlängerung), `createSession()`, `destroySession()`.
- `src/db/repo.ts` — ergänzen: Account-CRUD, Token-CRUD, Session-CRUD, Backfill, Dashboard-Query (Scans des Accounts, nach Domain gruppiert), Account-Löschung.
- `src/mail/notifier.ts` — ergänzen: Magic-Link-Mail (deutscher Text, gleiches SMTP).

## Sicherheit

- **Tokens:** 32 zufällige Bytes (base64url). DB speichert nur `sha256(token)`. Klartext existiert nur in Mail-URL (login) bzw. Cookie (session).
- **Login-Token:** Einmal-Nutzung (`used_at`), Ablauf 15 Min.
- **Session:** Ablauf 30 Tage, gleitend (bei Aktivität `expires_at`/`last_seen_at` verlängern). Cookie `HttpOnly; Secure; SameSite=Lax; Path=/`. Serverseitig widerrufbar.
- **Keine Account-Enumeration:** `/api/auth/request` antwortet immer gleich.
- **Rate-Limit:** einfache Begrenzung auf `/api/auth/request` (pro E-Mail/IP) und am Re-Scan-Button.
- **Mail-Fehler:** generische Antwort an den Nutzer, Fehler nur serverseitig geloggt.

## Dashboard-UX

- **`/dashboard`** (Server Component): Liste **nach Domain gruppiert**. Pro Domain: aktueller Score (`ScoreRing` wiederverwendet), Datum letzter Scan, **Mini-Score-Verlauf** (Sparkline + Datenpunkte aus allen Scans der Domain).
- Pro Eintrag: **„Report öffnen"** → bestehende Report-Ansicht des Scans; **„Erneut scannen"** → `POST /api/scan` mit bekannter URL + Account-Kontext → neuer datierter Scan, kein Gate, Verlauf wächst. KI-Analyse/Brand-Visibility laden weiterhin on-demand in der Report-Ansicht (keine doppelten Claude-Kosten beim Re-Scan).
- Kopfzeile: eingeloggte E-Mail + „Abmelden" + „Account löschen". Leerzustand, wenn keine Scans.
- `SiteHeader` bekommt kontextabhängig „Anmelden" bzw. „Dashboard".

**Report-Ansicht wiederverwenden:** Die heutige Reportdarstellung aus `app/page.tsx` wird so refaktoriert, dass sie einen Scan per ID rendern kann (für „Report öffnen"). Minimal-invasiv — bestehende Komponenten (`ScoreRing`, `CategoryCard`, `AiAnalysis`, `BrandVisibility`) bleiben unverändert. Anonymer Funnel auf `/` bleibt komplett erhalten.

## DSGVO / Account-Löschung

- `/datenschutz` erweitern: Account-Daten (E-Mail), technisch notwendiges Session-Cookie (kein Consent-Banner nötig), Speicherdauer, Login-per-Magic-Link, Löschrecht.
- **`POST /api/account/delete`** (eingeloggt, mit Bestätigungsdialog im Dashboard): löscht den Account-Datensatz, alle seine `sessions`, alle `login_tokens` mit dieser E-Mail und alle `leads` mit dieser E-Mail; setzt `scans.account_id` auf `NULL`. Ergebnis: keine personenbezogenen Daten mehr; reine Scan-Daten (Domain + Score) bleiben anonymisiert erhalten. Danach Cookie leeren + Redirect `/`.

## Fehlerbehandlung

- Ungültiger/abgelaufener/benutzter Login-Token → Redirect `/login` mit verständlicher Meldung.
- Fehlende/abgelaufene Session beim Aufruf von `/dashboard` → Redirect `/login`.
- Mail-Versand-Fehler → Nutzer sieht „Schau in dein Postfach", Fehler geloggt (kein 500-Leak).
- Re-Scan-Fehler → Fehlermeldung im Dashboard, bestehende Historie unangetastet.

## Tests (Vitest, wie bestehend)

- **Tokens:** erzeugen, hashen, verifizieren, Ablauf, Einmal-Nutzung.
- **Session:** anlegen, per Cookie auflösen, Ablauf, gleitende Verlängerung, Logout-Widerruf.
- **Backfill:** Scans per E-Mail korrekt zuordnen (inkl. Mehrfach-Scans und mehrerer Domains).
- **Scan-Route:** hängt `account_id` an, wenn Session vorhanden; Gate-Skip.
- **Account-Löschung:** entfernt Account/Sessions/Tokens/Leads, anonymisiert `scans.account_id`.
- **Route-Ebene:** `request` → Token erzeugt (immer 200); `callback` → Session + Redirect.

## Deployment

Wie etabliert: Commit auf `master` → GitHub Actions baut Image → `VPS_updateProjectV1(1478430, "aeo")` zieht & recreated. `ensureSchema()` legt neue Tabellen/Spalte beim ersten Zugriff an — keine manuelle Migration. Magic-Link nutzt bestehendes SMTP. Die absolute Basis-URL für den Link wird aus den Request-Headern abgeleitet (`Host`/`X-Forwarded-Host`/`X-Forwarded-Proto`, von Traefik gesetzt); optional eine Env `APP_BASE_URL` als Override, falls sich das in der Planung als nötig erweist.

## Offene Folge-Punkte (nicht 4a)

- 4b Monitoring (Cron, Trends über Zeit, Alerts).
- 4c Abo/Billing (Stripe, Tier-Gating, Limits).
