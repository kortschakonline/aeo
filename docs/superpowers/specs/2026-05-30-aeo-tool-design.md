# AEO-Tool — Design-Spec

**Datum:** 2026-05-30
**Live-Ziel:** https://aeo.kortschak.online
**Sprache:** Deutsch
**Status:** Design abgestimmt, bereit für Implementierungsplan

---

## 1. Zweck & Geschäftsziel

Ein öffentliches AEO-Scanner-Tool (Answer Engine Optimization) nach Vorbild von framer.com/aeo. Besucher geben ihre Domain ein und erhalten einen Score (0–100) plus Report, wie gut KI-Antwortmaschinen (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude) ihre Website finden, verstehen und zitieren können.

Das Tool dient als **Lead-Magnet** für Kortschaks Done-for-you-AEO-Optimierungsservice und ist technisch so gebaut, dass später ein **Self-Service-Abo** (Monitoring) ohne Architektur-Umbau ergänzt werden kann.

**Erfolgskriterien:**
- Ein Besucher kann anonym in <15 s eine Domain scannen und einen Score + Kurz-Übersicht sehen.
- Für den Voll-Report gibt er seine E-Mail ein → Lead landet in der DB, Kortschak wird per Mail benachrichtigt.
- Der Report endet mit einem klaren CTA zum kostenlosen Erstgespräch.

## 2. Brand & Design-System

Quelle: `docs/design/Farbdesign — Kortschak Schriften.html`. Logos: GitHub `kortschakonline/Logo-Kortschak-Werbeagentur` (SVG hell/dunkel/mono).

**Theme: Dark Editorial.**

| Token | Wert | Verwendung |
|---|---|---|
| `--bg` | `#0d0d0b` | Seiten-Hintergrund |
| `--bg-soft` | `#141412` | Sektionen |
| `--surface` | `#1a1a17` | Karten |
| `--ink` | `#f5f4ee` | Haupttext |
| `--muted` | `#9a9892` | Sekundärtext |
| `--faint` | `#5b5a55` | Hinweise |
| `--brand` | `#ff1c20` | Primär-Akzent (Rot) |
| `--brand-light` | `#f18700` | Sekundär-Akzent (Orange), Score-Gradient |
| `--brand-alt` | `#cc1418` | Dunkelrot |
| `--line` | `rgba(245,244,238,0.08)` | Trennlinien |

**Typografie:**
- **Fraunces** (Serif) → Display/Headlines
- **Inter Tight** (Sans) → Fließtext
- **JetBrains Mono** → Labels, Score-Zahlen, Check-Listen, technische Details

Subtiler Grain/Noise-Overlay (im Sheet bereits via `body::before` angelegt). Logo: helle SVG-Variante oben links.

## 3. Nutzer-Flow & UX

Single-Page-Erlebnis mit drei Zuständen:

### 3.1 Hero / Eingabe
Dunkler Vollbild-Hero. Große Fraunces-Headline („Findet die KI deine Website?"). Prominentes URL-Eingabefeld + Button „Scan starten". Logo oben links. Kurzer Vertrauens-Satz (z.B. „Kostenlos · 15 Sekunden · keine Anmeldung nötig").

### 3.2 Scan läuft
Live-Liste der Checks im Mono-Font, die nacheinander durchlaufen (`Schema.org … ✓`, `llms.txt … ✗`, `robots.txt … ✓` …). Vermittelt Tempo & technische Tiefe, baut Spannung bis zum Score auf. Echtzeit-Fortschritt vom Backend (Server-Sent Events oder Polling).

### 3.3 Ergebnis
- Zentraler **Score-Ring 0–100** (SVG, Gradient Brand-Rot → Orange).
- Vier **Kategorie-Karten** mit Ampel-Status und Teilscore:
  1. **Technik** (Fundament)
  2. **Auffindbarkeit** (Crawlbarkeit für KI)
  3. **Content** (Struktur & Klarheit)
  4. **KI-Sichtbarkeit** (taucht die Marke in KI-Antworten auf)
- **Frei sichtbar:** Gesamtscore + die vier Kategorie-Scores + je ein Satz Zusammenfassung.
- **Hinter E-Mail-Gate (unscharf/gesperrt):** Einzelbefunde, konkrete „So behebst du das"-Empfehlungen, KI-Analyse-Details, Brand-Visibility-Ergebnisse, PDF-Download.
- **Abschluss-CTA:** „Wir bringen deine Seite auf 100 — kostenloses Erstgespräch" → Kontakt/Terminlink.

## 4. Scan-Engine

### 4.1 Rendering
Jede Ziel-URL wird mit **Playwright/Chromium (headless)** gerendert, damit JS-gerenderte Inhalte (z.B. Framer-Seiten) erfasst werden — nicht nur das rohe HTML. Zusätzlich werden `robots.txt`, `sitemap.xml` und `llms.txt` direkt per HTTP geholt.

### 4.2 Checks nach Kategorie

**Technik**
- Meta-Tags (Title, Description vorhanden & sinnvolle Länge)
- OpenGraph / Social-Tags
- Schema.org / JSON-LD strukturierte Daten (Organization, Article, FAQ, Product, BreadcrumbList …)
- Canonical-Tag
- Sprach-Auszeichnung (`lang`, ggf. hreflang)
- Ladezeit / Antwortzeit-Signal

**Auffindbarkeit**
- `robots.txt` vorhanden; blockiert es KI-Crawler? (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot …)
- `llms.txt` vorhanden & valide
- `sitemap.xml` vorhanden & in robots.txt referenziert
- Indexierbarkeit (kein `noindex`)

**Content** (regelbasiert + KI)
- Heading-Struktur (genau eine H1, saubere H2/H3-Hierarchie)
- Frage-orientierte Überschriften / FAQ-Markup
- Klare Antwort-Blöcke, Absatzlänge, Listen/Tabellen
- **KI-Analyse (Claude):** bewertet Content-Klarheit, Zitierfähigkeit, Antwort-Orientierung auf einer Skala + liefert konkrete Verbesserungen

**KI-Sichtbarkeit** (Premium / spätere Stufe)
- Generiert aus Domain/Branche relevante Prompts, fragt KI-Engines und prüft, ob Marke/Domain genannt/zitiert wird

### 4.3 Scoring-Formel
Jeder Check liefert 0–1. Kategorie-Score = gewichteter Mittelwert der Checks × 100. Gesamtscore = gewichteter Mittelwert der Kategorien:

| Kategorie | Gewicht (MVP) | Gewicht (Vollausbau) |
|---|---|---|
| Technik | 35 % | 25 % |
| Auffindbarkeit | 35 % | 25 % |
| Content | 30 % | 30 % |
| KI-Sichtbarkeit | — (deaktiviert) | 20 % |

Im MVP wird KI-Sichtbarkeit nicht gewertet; die Gewichte normalisieren sich auf die aktiven Kategorien. Gewichte liegen in einer Config-Datei, damit sie ohne Code-Änderung justierbar sind.

## 5. Architektur

**Stack:** Next.js (App Router, Fullstack) · PostgreSQL · Playwright · alles in Docker, hinter Traefik (Auto-SSL) auf dem VPS.

```
Besucher → Traefik (HTTPS, aeo.kortschak.online)
              │
              ▼
        Next.js Container ──── API-Routen (Scan starten, Status, Lead speichern)
              │  │
              │  └── Scan-Service (Playwright/Chromium rendert Ziel-URL, führt Checks aus)
              │  └── Claude-Client (Content-Analyse, Brand-Visibility)
              ▼
        PostgreSQL Container (Scans, Checks, Leads)
```

**Komponenten (klar abgegrenzt):**
- **Web/UI** (Next.js Pages + React-Komponenten): Hero, Scan-Live-View, Report.
- **API-Layer** (Next.js Route Handlers): `POST /api/scan` (startet Scan), `GET /api/scan/:id` (Status/Ergebnis, SSE), `POST /api/lead` (E-Mail-Gate).
- **Scan-Engine** (eigenes Modul): Orchestriert Fetching, Rendering, Checks, Scoring. Jeder Check ist eine isolierte Funktion `(context) → {score, details}` — einzeln testbar.
- **Analyse-Adapter** (Claude): gekapselt hinter einem Interface, damit Engine austauschbar bleibt.
- **Persistenz** (Postgres via ORM, z.B. Prisma oder Drizzle): Scans, Check-Ergebnisse, Leads.
- **Notifier:** schickt Kortschak eine Mail pro Lead.

### 5.1 Datenmodell (Entwurf)
- `scans` — id, url, normalized_domain, status, total_score, category_scores (JSON), rendered_at, created_at
- `scan_checks` — id, scan_id, category, check_key, score, weight, details (JSON)
- `leads` — id, scan_id, email, created_at, notified_at
- (später) `users`, `monitored_domains`, `scan_schedule` für das Abo

### 5.2 Lead-Handling
E-Mail wird mit dem Scan verknüpft und in `leads` gespeichert. Notifier sendet eine Benachrichtigung an Kortschak (SMTP/Transactional-Mail; Provider in Stufe 1 zu wählen, z.B. Hostinger-SMTP oder Resend). Kein externes CRM in Stufe 1.

### 5.3 Konfiguration / Secrets
Env-Variablen: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `NOTIFY_EMAIL`, SMTP-Daten. Nichts hartkodiert.

## 6. Deployment
- Repo im Projektordner, Dockerfile + `docker-compose.yml` (App + Postgres) mit Traefik-Labels für `aeo.kortschak.online`.
- DNS: A-Record `aeo.kortschak.online` → `72.62.145.101` (via hostinger-vps MCP). Traefik holt Let's-Encrypt-Zertifikat automatisch.
- Playwright/Chromium-Abhängigkeiten im App-Image.

## 7. Stufenplan

- **Stufe 1 (MVP):** Landing + freier Scan mit regelbasierten Checks (Technik, Auffindbarkeit, Content-Struktur) → Score + Kurz-Übersicht. E-Mail-Gate für Detail-Report. Lead in DB + Mail. Live auf aeo.kortschak.online.
- **Stufe 2:** Claude-Content-Analyse im Content-Score + Detailempfehlungen. PDF-Report.
- **Stufe 3:** Brand-Visibility-Test gegen echte KI-Engines (vierte Kategorie aktivieren).
- **Stufe 4:** Accounts + Verlauf/Monitoring → Self-Service-Abo.

## 8. Offene Punkte (vor/in Stufe 1 zu klären)
1. Mail-Versandweg für Lead-Benachrichtigung (Hostinger-SMTP vs. Resend/Brevo) — Default: Hostinger-SMTP.
2. Genaue Schwellenwerte/Punktevergabe je Check (in Config, beim Bau iterieren).
3. Ziel des Abschluss-CTA (Kontaktformular, Cal.com-Link, E-Mail?).
4. Rate-Limiting/Missbrauchsschutz für den öffentlichen Scan-Endpoint.
