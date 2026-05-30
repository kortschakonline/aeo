# AEO-Tool Stufe 2 — Claude-Content-Analyse (Design-Spec)

**Datum:** 2026-05-30
**Baut auf:** [MVP-Spec](2026-05-30-aeo-tool-design.md) (Stufe 1, live unter https://aeo.kortschak.online)
**Status:** Design abgestimmt, bereit für Implementierungsplan

---

## 1. Zweck
Den freigeschalteten Report um eine qualitative **KI-Content-Analyse** (Claude) erweitern: wie klar, zitierfähig und antwort-orientiert ist der Seiteninhalt aus Sicht von KI-Antwortmaschinen? Das ist der inhaltliche Mehrwert gegenüber rein technischen Tools wie Framer.

## 2. Kernentscheidungen (abgestimmt)
- **Trigger:** Die KI-Analyse läuft **nur beim Freischalten** (`POST /api/lead`), nicht bei jedem öffentlichen Scan. Schützt vor API-Kosten durch anonyme Massenscans; nur echte Leads lösen einen API-Call aus.
- **Modell:** **claude-haiku-4-5** (per Env `ANALYSIS_MODEL` wechselbar).
- **Score-Einfluss:** Die KI verändert den Headline-Score (4 Kategorien) **nicht**. Der Score ist vor dem Freischalten sichtbar, die KI läuft erst danach — beide müssen konsistent bleiben. Die KI ist ein eigener Block im Voll-Report.

## 3. Was Claude liefert
Strukturierte Ausgabe (validiertes JSON):
- `dimensions`: genau 3 Einträge — `klarheit`, `zitierfaehigkeit`, `antwortorientierung`, je `{ score: 0..100, summary: string }`
- `strengths`: string[] (kurze Bullets)
- `improvements`: string[] (konkrete, umsetzbare Empfehlungen)
- `overallSummary`: string (1–2 Sätze Fazit)
Sprache: Deutsch. Fokus: Eignung des Inhalts, von KI gefunden, verstanden und zitiert zu werden.

## 4. Datenfluss & Persistenz
- **Beim Scan** (`runScan`): aus dem gerenderten HTML wird der sichtbare Text extrahiert (Skripte/Styles/Tags entfernt), auf **15.000 Zeichen** gekürzt und als `contentExcerpt` mitgeführt.
- **Speicherung:** neue Spalten an `scans`: `content_excerpt text` (beim Scan gefüllt) und `ai_analysis jsonb` (nullable, anfangs leer).
- **Beim Freischalten** (`POST /api/lead`): nach `saveLead` + `notifyLead` wird geprüft, ob `ai_analysis` schon existiert. Falls nicht: `analyzeContent(contentExcerpt)` aufrufen, Ergebnis via `saveAiAnalysis(scanId, analysis)` speichern. Die Analyse wird im Antwort-JSON zurückgegeben. Wiederholtes Freischalten nutzt das gespeicherte Ergebnis (kein erneuter Call).
- **Schema-Migration:** idempotent über `ensureSchema()` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Kein manueller Schritt.

## 5. Komponenten
- `src/ai/analyze.ts` — **neu.** `analyzeContent(text, deps?)`: ruft Claude via Anthropic-SDK auf, erzwingt strukturierte Tool-Ausgabe, validiert sie (zod), gibt `AiAnalysis` zurück. Anthropic-Client ist **injizierbar** (`deps.client`) für Tests. System-Prompt mit **Prompt-Caching**. Modell aus `ANALYSIS_MODEL` (Default `claude-haiku-4-5`). Wirft bei API-Fehlern (Aufrufer behandelt).
- `src/ai/types.ts` — **neu.** `AiAnalysis`, `AiDimension` Typen + zod-Schema.
- `src/engine/text.ts` — **neu.** `extractText(html): string` — pure Funktion, entfernt `<script>/<style>`, Tags, kollabiert Whitespace, kürzt auf 15.000 Zeichen. Unit-getestet.
- `src/engine/scan.ts` — **geändert.** Ruft `extractText` und gibt `contentExcerpt` im Ergebnis mit zurück (additiv, bestehende Felder unverändert).
- `src/engine/types.ts` — **geändert.** `ScanResult.contentExcerpt?: string`.
- `src/db/schema.ts` — **geändert.** Spalten `contentExcerpt`, `aiAnalysis`.
- `src/db/migrate.ts` — **geändert.** ADD COLUMN IF NOT EXISTS für beide.
- `src/db/repo.ts` — **geändert.** `saveScan` speichert `contentExcerpt`; neu `saveAiAnalysis(scanId, analysis)`; `getScan` liefert beide Felder.
- `app/api/lead/route.ts` — **geändert.** Nach Lead+Notify: KI-Analyse erzeugen/laden, speichern, im Response zurückgeben. KI-Fehler werden gefangen (Unlock gelingt trotzdem).
- `components/AiAnalysis.tsx` — **neu.** Rendert den KI-Block (3 Dimensions-Balken, Stärken, Verbesserungen, Fazit) im Brand-Stil.
- `components/EmailGate.tsx` / `app/page.tsx` — **geändert.** Unlock-Response enthält jetzt `aiAnalysis`; wird an `AiAnalysis` weitergereicht. Fallback-Zustand, wenn `aiAnalysis` null/fehlerhaft.

## 6. Fehlerbehandlung
- KI-Fehler (fehlender Key, Rate-Limit, Timeout, ungültige Ausgabe) werden in `/api/lead` gefangen: Lead bleibt gespeichert, Mail wird versendet, Response enthält `aiAnalysis: null` + `aiError: true`. Der KI-Block zeigt „Analyse derzeit nicht verfügbar — wir melden uns mit der Detail-Auswertung." Unlock und Mailversand sind nie blockiert.
- Timeout für den Claude-Call: 30 s.

## 7. Tests
- `extractText`: entfernt Script/Style/Tags, kürzt korrekt, kollabiert Whitespace.
- `analyzeContent`: mit injiziertem Fake-Client → parst/validiert strukturierte Ausgabe; wirft bei invalider Ausgabe; baut den Request korrekt (Modell, Tool, System-Prompt). Kein echter Netzwerk-Call.
- `scan`: bestehender Test bleibt grün; ergänzt um Prüfung, dass `contentExcerpt` gesetzt ist.

## 8. Konfiguration / Deploy
- Neue Env: `ANTHROPIC_API_KEY` (Pflicht für die Analyse), optional `ANALYSIS_MODEL` (Default `claude-haiku-4-5`).
- Wird in die VPS-Projekt-Env aufgenommen (nicht ins Repo). Image-Rebuild via GitHub Actions, dann VPS-Redeploy (zieht neues Image + neue Env).
- `@anthropic-ai/sdk` als neue Dependency.

## 9. Bewusst NICHT in Stufe 2 (YAGNI)
- Keine Änderung am Headline-Score / an der Gewichtung.
- Keine Brand-Visibility (das ist Stufe 3).
- Kein PDF-Export (separat).
- Keine erneute Seiten-Render beim Freischalten (wir nutzen den gespeicherten `contentExcerpt`).
