# AEO-Tool Stufe 3 — Brand-Visibility — Design-Spec

**Datum:** 2026-05-30
**Baut auf:** [MVP](2026-05-30-aeo-tool-design.md) + [Stufe 2](2026-05-30-aeo-stufe2-ki-analyse-design.md) (beide live unter https://aeo.kortschak.online)
**Status:** Design abgestimmt, bereit für Implementierungsplan

---

## 1. Zweck
Messen, ob die Marke/Domain in echten, web-gestützten KI-Antworten auftaucht, wenn ein potenzieller Kunde typische Fragen stellt. Das stärkste Verkaufsargument: „Wenn jemand eine KI nach Anbietern in deiner Branche fragt — wirst du genannt?"

## 2. Kernentscheidungen (abgestimmt)
- **Engine:** Claude mit dem **Websuche-Tool** (Anthropic-Server-Tool), nutzt den vorhandenen `ANTHROPIC_API_KEY`. Ehrlich benannt als web-gestützter KI-Antwort-Test. Modell per Env `BRAND_MODEL` (Default `claude-haiku-4-5-20251001`).
- **Umfang:** 3–5 von Claude generierte, branchen-/ortsspezifische Nutzerfragen pro Test.
- **Trigger & UX:** Läuft **nach dem Freischalten** als **separater, gecachter Schritt** (eigener Endpoint), damit die schnelle Stufe-2-Analyse nicht blockiert wird. Der Report zeigt sofort Stufe 2 und lädt Brand-Visibility nach.
- **Score:** Eigener Block mit eigenem Visibility-Score (0–100). Beeinflusst den **Headline-Score nicht** (Konsistenz vor/nach Freischaltung, wie Stufe 2). Die 4. Kategorie-Karte „KI-Sichtbarkeit" verweist auf den Block.

## 3. Ablauf
1. **Fragen + Marke:** Ein Claude-Aufruf (ohne Websuche) erzeugt aus `content_excerpt` + Domain strukturiert: `brandName` (erkannter Markenname) und `questions` (3–5 realistische Nutzerfragen, z. B. „Wer macht Fahrzeugbeschriftung in Trofaiach?").
2. **Abfrage:** Für jede Frage ein Claude-Aufruf **mit Websuche-Tool** (parallel) → web-gestützte Antwort + zitierte Quellen (Titel/URLs).
3. **Erkennung:** Pro Frage `appeared = true`, wenn `brandName` ODER die Domain (auch ohne `www.`) in Antworttext oder einer zitierten Quelle vorkommt (case-insensitive). Konkurrenz: andere zitierte Domains/Marken werden gesammelt.
4. **Score:** `score = round(100 * appearedCount / questionCount)`.

## 4. Datenstruktur
`BrandVisibility`:
```
{
  brandName: string,
  score: number,            // 0..100
  questions: [{
    question: string,
    appeared: boolean,
    sources: string[],      // zitierte Quellen-URLs/Domains
  }],
  competitors: string[],    // wiederkehrende fremde Domains/Marken (dedupliziert)
}
```

## 5. Komponenten
- `src/ai/brand-prompt.ts` — **neu.** System-Prompt + Tool-Schema für Fragen-Generierung; System-Prompt für die Websuche-Antwort.
- `src/ai/brand.ts` — **neu.** `runBrandVisibility(content, domain, deps?)`: generiert Fragen, fragt Claude+Websuche je Frage (parallel), wertet Treffer/Quellen aus, baut `BrandVisibility`. Anthropic-Client **injizierbar** (`deps.client`), Modell aus `BRAND_MODEL`. Eine reine Hilfsfunktion `detectBrand(answer, sources, brandName, domain)` (pure, unit-getestet).
- `src/ai/types.ts` — **geändert.** `BrandVisibility`, `BrandQuestion` + zod-Schema.
- `src/db/schema.ts` — **geändert.** Spalte `brand_visibility jsonb` (nullable) an `scans`.
- `src/db/migrate.ts` — **geändert.** `ALTER TABLE scans ADD COLUMN IF NOT EXISTS brand_visibility jsonb`.
- `src/db/repo.ts` — **geändert.** `saveBrandVisibility(scanId, data)`; `getScan` liefert das Feld (select all).
- `app/api/scan/[id]/brand/route.ts` — **neu.** `POST`: Scan laden; wenn `brand_visibility` gecacht → zurückgeben; sonst `runBrandVisibility(contentExcerpt, domain)`, speichern, zurückgeben. Fehler → `{ brandVisibility: null, error: true }` (kein 500).
- `components/BrandVisibility.tsx` — **neu.** Rendert den Block (Score, Fragen-Liste mit ✓/✗ + Quellen, Mitbewerber-Liste, Fallback/Loading).
- `components/EmailGate.tsx` / `app/page.tsx` — **geändert.** Nach Unlock zusätzlich `POST /api/scan/<id>/brand` aufrufen (Lade-Zustand), Ergebnis an `BrandVisibility` reichen. Bestehende Stufe-2-Anzeige unverändert.

## 6. Websuche-Tool
Anthropic-Server-Tool `web_search` (Typ `web_search_20250305`), `max_uses` klein halten (z. B. 3). Antwort-Inhalt enthält Text + `citations`/Quellen; wir extrahieren Titel/URLs aus den Antwortblöcken. Timeout 40 s pro Frage.

## 7. Fehlerbehandlung
- Jede Frage einzeln gekapselt: scheitert eine Websuche, zählt die Frage als „nicht erschienen" mit Hinweis, der Test läuft weiter.
- Scheitert der ganze Lauf (kein Key/Tool), liefert der Endpoint `{ brandVisibility: null, error: true }`; UI zeigt Fallback („KI-Sichtbarkeit konnte nicht ermittelt werden — wir prüfen das manuell im Erstgespräch."). Niemals Report-blockierend.

## 8. Tests
- `detectBrand`: findet Marke/Domain in Antwort bzw. Quellen (inkl. ohne `www.`, case-insensitive); kein Treffer → false.
- `runBrandVisibility`: mit injiziertem Fake-Client (Fragen-Antwort + Websuche-Antworten) → korrekter Score, `questions`-Array, `competitors`; ein fehlschlagender Frage-Call senkt den Score, ohne den Lauf abzubrechen.
- Kein echter Netzwerk-/API-Call in Tests.

## 9. Konfiguration / Deploy
- Nutzt vorhandenen `ANTHROPIC_API_KEY`. Neue optionale Env `BRAND_MODEL` (Default `claude-haiku-4-5-20251001`).
- Image-Rebuild via GitHub Actions → VPS-Redeploy (Env ergänzt um `BRAND_MODEL`). DB-Spalte via `ensureSchema`.

## 10. Bewusst NICHT in Stufe 3 (YAGNI)
- Keine zweite Engine (Perplexity/OpenAI) — Architektur erlaubt späteres Zuschalten, aber nicht jetzt.
- Kein Einfluss auf den Headline-Score / die Gewichtung.
- Kein echtes Hintergrund-Job-System: der separate Endpoint rechnet synchron beim Aufruf (Client zeigt Ladezustand), Ergebnis wird gecacht.
- Keine Accounts/History (Stufe 4).
