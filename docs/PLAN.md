# AEO-Tool — Planungsdokument (Stand 2026-05-30, vor dem Bau)

Live-Ziel: **https://aeo.kortschak.online**
Status: Brainstorming abgeschlossen bis Produktentscheidungen. Visuelles Design + Architektur-Feindesign offen. **Es wird noch nicht gebaut.**

> 📂 **Hierher das Design-Sheet kopieren:** `/Users/jornmartin/AEO/docs/design/` (lege ich an, sobald du Dateien bringst). Branding/Farben/Typo aus dem Sheet überschreiben alle Vorschläge unten.

---

## 1. Produktidee
Ein AEO-Scanner (Answer Engine Optimization) nach Vorbild von framer.com/aeo: Besucher gibt seine Domain ein → bekommt einen Score + Report, wie gut KI-Antwortmaschinen (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude) die Seite finden, verstehen und zitieren können → CTA: „Wir optimieren das für dich." Tool = Lead-Magnet + Fundament für späteres SaaS.

## 2. Locked-in Entscheidungen
| Thema | Entscheidung |
|---|---|
| **Scoring** | Technische Checks **+** KI-Analyse (Content-Klarheit/Zitierfähigkeit) **+** Brand-Visibility (taucht Marke in echten KI-Antworten auf?) |
| **Funnel** | Scan frei & anonym (Score + Kurz-Übersicht sofort). Voll-Report (Details, KI-Analyse, Brand-Visibility, PDF) erst nach **E-Mail** → Lead |
| **Monetarisierung** | Done-for-you-Service zuerst (manuelle Optimierung) → Architektur erlaubt später Self-Service-**Abo** (Monitoring) ohne Umbau |
| **Sprache** | Nur Deutsch |
| **Vorgehen** | In Stufen bauen, schnell etwas Live |

## 3. Infrastruktur (vorhanden)
- **VPS** srv.jrn.digital · 72.62.145.101 · 2 vCPU / 8 GB RAM / 100 GB · **Ubuntu 24.04 + Docker + Traefik** (Auto-SSL)
- **Domain** kortschak.online aktiv → Subdomain `aeo.kortschak.online` via DNS auf VPS-IP, Traefik-Routing
- Deployment per Docker-Container; Traefik übernimmt HTTPS

## 4. Vorgeschlagene Scan-Checks (Entwurf — beim Start verfeinern)
**Technisch (regelbasiert, schnell, gratis):**
- Schema.org / JSON-LD strukturierte Daten (Organization, FAQ, Article, Product …)
- `llms.txt` vorhanden & valide
- `robots.txt` — blockiert es KI-Crawler (GPTBot, ClaudeBot, PerplexityBot …)?
- Meta-Tags (Title, Description, OpenGraph)
- `sitemap.xml`
- Heading-Struktur (H1/H2 sauber, frage-orientiert?)
- FAQ-/Q&A-Markup, klare Antwort-Blöcke
- Ladezeit / Core-Signale
- Canonical, Sprache/hreflang
**KI-Analyse (LLM-Call):** Bewertet Content-Klarheit, Zitierfähigkeit, Antwort-Orientierung.
**Brand-Visibility (Premium-Stufe):** Reale Prompts an KI-Engines → erscheint Marke/Domain? (langsamer/teurer → später)

> ⚠️ Headless-Browser (Playwright/Chromium) nötig: moderne/Framer-Seiten sind JS-gerendert; reiner HTML-Abruf sieht den Inhalt nicht.

## 5. Vorgeschlagener Stufenplan (zur Diskussion)
- **Stufe 1 (MVP, schnell live):** Landing-Page + freier Scan mit technischen Checks → Score + Kurz-Übersicht. DB speichert Scans. E-Mail-Gate für Voll-Report (PDF/Detailseite). CTA Done-for-you.
- **Stufe 2:** KI-Analyse-Layer (Content-Klarheit) im Voll-Report.
- **Stufe 3:** Brand-Visibility-Test gegen echte KI-Engines.
- **Stufe 4:** Accounts + Verlauf/Monitoring → Self-Service-Abo aktivieren.

## 6. Architektur-Optionen (beim Start entscheiden)
- **A — Node + Postgres + Playwright, alles in Docker (Empfehlung):** Ein Backend (z.B. Fastify/Express oder Next.js), Postgres-Container, Playwright für Rendering, Traefik-Routing. Sauber, skaliert in Richtung SaaS.
- **B — Next.js Fullstack + Postgres:** Frontend & API in einem, schnelle hübsche UI, gut für Marketing-Seite + Dashboard später.
- **C — schlank:** statisches Frontend + kleiner API-Service. Weniger Overhead, aber mehr Klebearbeit Richtung SaaS.

## 7. Offene Punkte für den Start
1. Visuelles Design / Branding (Design-Sheet abwarten)
2. Tech-Stack final (A/B/C oben)
3. Score-Formel & Gewichtung der Checks
4. Welcher LLM-Key für KI-Analyse (Anthropic/Claude vorhanden?)
5. E-Mail-Versand/Lead-Handling (wohin gehen Leads? CRM/E-Mail-Tool?)
6. Genaue Liste & Schwellenwerte der Checks
