# AEO-Tool Stufe 2 — Claude-Content-Analyse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Freischalten des Reports (`POST /api/lead`) eine einmalige Claude-Content-Analyse (Haiku 4.5) auf dem gespeicherten Seitentext ausführen, am Scan speichern und im freigeschalteten Report als eigenen „KI-Analyse"-Block anzeigen.

**Architecture:** Reine, getestete Module — `extractText` (Tag-Stripping), `analyzeContent` (Anthropic-SDK, injizierbarer Client, strukturierte Tool-Ausgabe, zod-validiert). Der Scan speichert einen Text-Auszug; die `/api/lead`-Route erzeugt/lädt die Analyse, fängt KI-Fehler ab (Unlock gelingt immer). Der Headline-Score bleibt unverändert rule-based.

**Tech Stack:** @anthropic-ai/sdk, zod, Drizzle/Postgres, Next.js, Vitest. Bestehender Code aus Stufe 1 (live).

**Scope:** Nur Stufe 2 laut [Spec](../specs/2026-05-30-aeo-stufe2-ki-analyse-design.md). Kein Score-Einfluss, keine Brand-Visibility, kein PDF.

---

## File Structure
```
src/ai/types.ts        # AiAnalysis/AiDimension + zod-Schema (neu)
src/ai/analyze.ts      # analyzeContent(text, deps?) via Anthropic-SDK (neu)
src/ai/prompt.ts       # System-Prompt + Tool-Schema (neu)
src/engine/text.ts     # extractText(html) pure (neu)
src/engine/scan.ts     # + contentExcerpt im Ergebnis (geändert)
src/engine/types.ts    # ScanResult.contentExcerpt? (geändert)
src/db/schema.ts       # + content_excerpt, ai_analysis (geändert)
src/db/migrate.ts      # + ADD COLUMN IF NOT EXISTS (geändert)
src/db/repo.ts         # saveScan(+excerpt), saveAiAnalysis, getScan(+felder) (geändert)
app/api/lead/route.ts  # Analyse beim Unlock (geändert)
components/AiAnalysis.tsx  # KI-Block UI (neu)
components/EmailGate.tsx / app/page.tsx  # Unlock-Response → AiAnalysis (geändert)
tests/text.test.ts, tests/analyze.test.ts  # (neu)
```

---

## Task 1: Anthropic-SDK installieren

**Files:** Modify `package.json`

- [ ] **Step 1: Installieren**

Run im Projektordner `/Users/jornmartin/AEO`:
```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verifizieren**

Run: `node -e "require('@anthropic-ai/sdk'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**
```bash
git add package.json package-lock.json && git commit -m "chore: add @anthropic-ai/sdk"
```

---

## Task 2: Text-Extraktion (TDD)

**Files:** Create `src/engine/text.ts`; Test `tests/text.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/text.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { extractText } from '@/src/engine/text'

describe('extractText', () => {
  it('entfernt Tags und gibt sichtbaren Text', () => {
    expect(extractText('<h1>Hallo</h1><p>Welt</p>')).toBe('Hallo Welt')
  })
  it('entfernt script- und style-Inhalte', () => {
    const html = '<style>.a{color:red}</style><p>Text</p><script>var x=1</script>'
    expect(extractText(html)).toBe('Text')
  })
  it('kollabiert Whitespace', () => {
    expect(extractText('<p>a</p>\n\n   <p>b</p>')).toBe('a b')
  })
  it('kürzt auf 15000 Zeichen', () => {
    const long = '<p>' + 'x'.repeat(20000) + '</p>'
    expect(extractText(long).length).toBe(15000)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- text`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

Create `src/engine/text.ts`:
```ts
const MAX = 15000

export function extractText(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX ? text.slice(0, MAX) : text
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- text`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/engine/text.ts tests/text.test.ts && git commit -m "feat(engine): text extraction for AI analysis"
```

---

## Task 3: KI-Typen & zod-Schema

**Files:** Create `src/ai/types.ts`

- [ ] **Step 1: Implementierung**

Create `src/ai/types.ts`:
```ts
import { z } from 'zod'

export const AiDimensionSchema = z.object({
  key: z.enum(['klarheit', 'zitierfaehigkeit', 'antwortorientierung']),
  score: z.number().min(0).max(100),
  summary: z.string(),
})

export const AiAnalysisSchema = z.object({
  dimensions: z.array(AiDimensionSchema).length(3),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  overallSummary: z.string(),
})

export type AiDimension = z.infer<typeof AiDimensionSchema>
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>
```

- [ ] **Step 2: Verifizieren**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**
```bash
git add src/ai/types.ts && git commit -m "feat(ai): analysis types + zod schema"
```

---

## Task 4: Prompt & Tool-Schema

**Files:** Create `src/ai/prompt.ts`

- [ ] **Step 1: Implementierung**

Create `src/ai/prompt.ts`:
```ts
export const SYSTEM_PROMPT = `Du bist ein Experte für Answer Engine Optimization (AEO). Du bewertest, wie gut sich der Textinhalt einer Webseite dafür eignet, von KI-Antwortmaschinen (ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude) gefunden, verstanden und korrekt zitiert zu werden.

Bewerte drei Dimensionen je 0–100:
- klarheit: Ist der Inhalt klar, eindeutig und gut strukturiert formuliert?
- zitierfaehigkeit: Enthält er eigenständige, zitierfähige Aussagen, Definitionen, Fakten?
- antwortorientierung: Beantwortet er konkrete Fragen direkt (Frage→Antwort, Listen, Definitionen)?

Antworte ausschließlich über das Tool "report". Alle Texte auf Deutsch, knapp und konkret. Gib 2–4 Stärken und 2–4 umsetzbare Verbesserungen.`

export const REPORT_TOOL = {
  name: 'report',
  description: 'Gibt die strukturierte AEO-Content-Analyse zurück.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dimensions: {
        type: 'array',
        description: 'Genau 3 Dimensionen: klarheit, zitierfaehigkeit, antwortorientierung.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['klarheit', 'zitierfaehigkeit', 'antwortorientierung'] },
            score: { type: 'number', description: '0 bis 100' },
            summary: { type: 'string', description: 'Ein Satz auf Deutsch.' },
          },
          required: ['key', 'score', 'summary'],
        },
      },
      strengths: { type: 'array', items: { type: 'string' } },
      improvements: { type: 'array', items: { type: 'string' } },
      overallSummary: { type: 'string', description: '1–2 Sätze Fazit auf Deutsch.' },
    },
    required: ['dimensions', 'strengths', 'improvements', 'overallSummary'],
  },
}
```

- [ ] **Step 2: Commit**
```bash
git add src/ai/prompt.ts && git commit -m "feat(ai): system prompt + report tool schema"
```

---

## Task 5: analyzeContent (TDD, injizierbarer Client)

**Files:** Create `src/ai/analyze.ts`; Test `tests/analyze.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/analyze.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { analyzeContent } from '@/src/ai/analyze'

const validInput = {
  dimensions: [
    { key: 'klarheit', score: 80, summary: 'klar' },
    { key: 'zitierfaehigkeit', score: 60, summary: 'ok' },
    { key: 'antwortorientierung', score: 50, summary: 'teils' },
  ],
  strengths: ['gut strukturiert'],
  improvements: ['mehr FAQ'],
  overallSummary: 'Solide Basis.',
}

function fakeClient(toolInput: unknown) {
  return { messages: { create: vi.fn(async () => ({ content: [{ type: 'tool_use', name: 'report', input: toolInput }] })) } }
}

describe('analyzeContent', () => {
  it('parst die strukturierte Tool-Ausgabe', async () => {
    const client = fakeClient(validInput)
    const r = await analyzeContent('etwas Text', { client, model: 'test-model' })
    expect(r.dimensions).toHaveLength(3)
    expect(r.overallSummary).toBe('Solide Basis.')
    expect(client.messages.create).toHaveBeenCalledOnce()
    const arg = client.messages.create.mock.calls[0][0]
    expect(arg.model).toBe('test-model')
    expect(arg.tool_choice).toEqual({ type: 'tool', name: 'report' })
  })
  it('wirft bei ungültiger Tool-Ausgabe', async () => {
    const client = fakeClient({ dimensions: [], strengths: [], improvements: [], overallSummary: '' })
    await expect(analyzeContent('x', { client, model: 'm' })).rejects.toThrow()
  })
  it('wirft, wenn kein tool_use im Response', async () => {
    const client = { messages: { create: vi.fn(async () => ({ content: [{ type: 'text', text: 'nope' }] })) } }
    await expect(analyzeContent('x', { client, model: 'm' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- analyze`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

Create `src/ai/analyze.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import { AiAnalysisSchema, type AiAnalysis } from '@/src/ai/types'
import { SYSTEM_PROMPT, REPORT_TOOL } from '@/src/ai/prompt'

interface MessagesClient {
  messages: { create: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ content: Array<{ type: string; name?: string; input?: unknown }> }> }
}

export interface AnalyzeDeps {
  client?: MessagesClient
  model?: string
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export async function analyzeContent(text: string, deps: AnalyzeDeps = {}): Promise<AiAnalysis> {
  const client: MessagesClient = deps.client ?? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient)
  const model = deps.model ?? process.env.ANALYSIS_MODEL ?? DEFAULT_MODEL

  const res = await client.messages.create(
    {
      model,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report' },
      messages: [{ role: 'user', content: `Analysiere diesen Seiteninhalt für AEO:\n\n${text}` }],
    },
    { timeout: 30000 },
  )

  const block = res.content.find((b) => b.type === 'tool_use')
  if (!block || block.input === undefined) throw new Error('Keine tool_use-Antwort von Claude')
  return AiAnalysisSchema.parse(block.input)
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- analyze`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/ai/analyze.ts tests/analyze.test.ts && git commit -m "feat(ai): analyzeContent via Anthropic SDK"
```

---

## Task 6: Scan liefert contentExcerpt (TDD)

**Files:** Modify `src/engine/types.ts`, `src/engine/scan.ts`; Test `tests/scan.test.ts`

- [ ] **Step 1: Typ erweitern**

In `src/engine/types.ts` das `ScanResult`-Interface um ein optionales Feld ergänzen (nach `checks`):
```ts
export interface ScanResult {
  url: string
  domain: string
  total: number
  categories: CategoryScore[]
  checks: CheckResult[]
  contentExcerpt?: string
}
```

- [ ] **Step 2: Test ergänzen**

In `tests/scan.test.ts` innerhalb des bestehenden `it('orchestriert ...')` nach den vorhandenen Assertions ergänzen:
```ts
    expect(typeof r.contentExcerpt).toBe('string')
    expect(r.contentExcerpt!.length).toBeGreaterThan(0)
```

- [ ] **Step 3: Test schlägt fehl**

Run: `npm test -- scan`
Expected: FAIL (`contentExcerpt` ist undefined).

- [ ] **Step 4: scan.ts anpassen**

In `src/engine/scan.ts` den Import ergänzen und das Ergebnis erweitern. Import oben hinzufügen:
```ts
import { extractText } from '@/src/engine/text'
```
Die letzte Zeile der Funktion `runScan` ersetzen:
```ts
  const result = scoreScan(url, domain, checks)
  return { ...result, contentExcerpt: extractText(html) }
```
(ersetzt `return scoreScan(url, domain, checks)`)

- [ ] **Step 5: Test grün**

Run: `npm test -- scan`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/engine/types.ts src/engine/scan.ts tests/scan.test.ts && git commit -m "feat(engine): scan returns contentExcerpt"
```

---

## Task 7: DB — Spalten, Migration, Repo

**Files:** Modify `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/repo.ts`

- [ ] **Step 1: Schema erweitern**

In `src/db/schema.ts` die `scans`-Tabelle um zwei Spalten ergänzen (nach `checks: jsonb('checks').notNull(),`):
```ts
  contentExcerpt: text('content_excerpt'),
  aiAnalysis: jsonb('ai_analysis'),
```

- [ ] **Step 2: Migration erweitern**

In `src/db/migrate.ts` innerhalb der `ensureSchema`-IIFE nach dem `leads`-CREATE die idempotenten ALTERs ergänzen:
```ts
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS content_excerpt text`)
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS ai_analysis jsonb`)
```

- [ ] **Step 3: Repo anpassen**

In `src/db/repo.ts`:
(a) Import ergänzen (NUR diese eine Zeile zusätzlich — `ScanResult` wird bereits importiert, nicht duplizieren):
```ts
import type { AiAnalysis } from '@/src/ai/types'
```
(b) In `saveScan` den `values`-Block um `contentExcerpt` ergänzen:
```ts
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
    contentExcerpt: r.contentExcerpt ?? '',
  }).returning({ id: scans.id })
```
(c) Neue Funktion am Dateiende:
```ts
export async function saveAiAnalysis(scanId: number, analysis: AiAnalysis): Promise<void> {
  await ensureSchema()
  await db.update(scans).set({ aiAnalysis: analysis }).where(eq(scans.id, scanId))
}
```
(`getScan` braucht keine Änderung — `select()` liefert alle Spalten inkl. der neuen.)

- [ ] **Step 4: Verifizieren**

Run: `npx tsc --noEmit && npm run build`
Expected: beide erfolgreich.

- [ ] **Step 5: Commit**
```bash
git add src/db && git commit -m "feat(db): content_excerpt + ai_analysis columns & saveAiAnalysis"
```

---

## Task 8: Lead-Route — Analyse beim Unlock

**Files:** Modify `app/api/lead/route.ts`

- [ ] **Step 1: Route anpassen**

`app/api/lead/route.ts` komplett ersetzen mit:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveLead, getScan, saveAiAnalysis } from '@/src/db/repo'
import { notifyLead } from '@/src/mail/notifier'
import { analyzeContent } from '@/src/ai/analyze'
import type { AiAnalysis } from '@/src/ai/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({ scanId: z.number(), email: z.string().email() })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })

  const scan = await getScan(parsed.data.scanId)
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })

  await saveLead(parsed.data.scanId, parsed.data.email)
  await notifyLead(parsed.data.email, scan.domain, scan.total)

  let aiAnalysis: AiAnalysis | null = (scan.aiAnalysis as AiAnalysis | null) ?? null
  let aiError = false
  if (!aiAnalysis) {
    try {
      aiAnalysis = await analyzeContent(scan.contentExcerpt ?? '')
      await saveAiAnalysis(parsed.data.scanId, aiAnalysis)
    } catch (e) {
      aiError = true
      console.error('KI-Analyse fehlgeschlagen:', e)
    }
  }

  return NextResponse.json({ ok: true, aiAnalysis, aiError })
}
```

- [ ] **Step 2: Verifizieren**

Run: `npx tsc --noEmit && npm run build`
Expected: erfolgreich; Route `/api/lead` weiterhin als dynamisch gelistet.

- [ ] **Step 3: Commit**
```bash
git add app/api/lead/route.ts && git commit -m "feat(api): run Claude analysis on report unlock"
```

---

## Task 9: UI — KI-Analyse-Block

**Files:** Create `components/AiAnalysis.tsx`; Modify `components/EmailGate.tsx` und/oder `app/page.tsx`

> Präsentationsarbeit; visuelle Abnahme im Browser. Brand-Tokens nutzen (`--surface`, `--brand`, `--brand-light`, `--ink`, `--muted`, Fonts `font-serif`/`font-mono`).

- [ ] **Step 1: AiAnalysis-Komponente**

Create `components/AiAnalysis.tsx` (Client-tauglich, keine Server-Imports). Props:
```ts
type Dim = { key: string; score: number; summary: string }
export type AiAnalysisData = { dimensions: Dim[]; strengths: string[]; improvements: string[]; overallSummary: string }
export function AiAnalysis({ data, error }: { data: AiAnalysisData | null; error?: boolean }) { /* ... */ }
```
Verhalten:
- Wenn `error` oder `data` null: dezenter Fallback-Block „KI-Analyse derzeit nicht verfügbar — wir senden dir die Detail-Auswertung per E-Mail." (Brand-Stil, keine harte Fehlermeldung).
- Sonst: Überschrift „KI-Analyse" (font-serif). Die 3 Dimensionen mit deutschem Label (klarheit→„Klarheit", zitierfaehigkeit→„Zitierfähigkeit", antwortorientierung→„Antwort-Orientierung"), Score in `font-mono` + schmaler Fortschrittsbalken (Farbe analog CategoryCard: ≥80 grün-ish, 50–79 `--brand-light`, <50 `--brand`), darunter `summary`. Dann „Stärken" (Liste) und „Empfehlungen" (Liste, Akzent `--brand-light`), zuletzt `overallSummary` als hervorgehobenes Fazit.

- [ ] **Step 2: Unlock-Response durchreichen**

Im Report-Flow (`app/page.tsx` bzw. `components/EmailGate.tsx`): Die `fetch('/api/lead', …)`-Antwort liefert jetzt `{ ok, aiAnalysis, aiError }`. Diese Werte im State halten und nach erfolgreichem Unlock `<AiAnalysis data={aiAnalysis} error={aiError} />` im freigeschalteten Bereich rendern (unterhalb der bestehenden Detail-Checks, oberhalb des CTA). Den vorhandenen Unlock-Mechanismus (Blur entfernen) beibehalten. Lies die aktuelle Datei vor der Änderung und füge dich in den bestehenden State-Fluss ein.

- [ ] **Step 3: Verifizieren**

Run: `npm run build`
Expected: erfolgreich. Lokal mit `npm run dev` prüfen, dass der freigeschaltete Report den KI-Block (bzw. den Fallback ohne Key) zeigt.

- [ ] **Step 4: Commit**
```bash
git add components app/page.tsx && git commit -m "feat(ui): KI-Analyse block in unlocked report"
```

---

## Task 10: Deployment

> Reine Infra, kein Code. Voraussetzung: `ANTHROPIC_API_KEY` vom Nutzer.

- [ ] **Step 1: Vollständige Suite grün + Push**

Run: `npm test && npm run build`
Expected: alle Tests grün, Build ok.
Dann: `git push origin <branch>:master` → GitHub Actions baut & pusht das neue Image (`gh run watch <id> --exit-status` bis success abwarten).

- [ ] **Step 2: VPS-Redeploy mit neuer Env**

`VPS_createNewProjectV1` (hostinger-vps MCP, virtualMachineId 1478430, projectName "aeo") mit identischer Compose wie bisher, aber Environment ergänzt um:
```
ANTHROPIC_API_KEY=<vom Nutzer>
ANALYSIS_MODEL=claude-haiku-4-5-20251001
```
(alle bestehenden Env-Werte — DB_PASS, NOTIFY_EMAIL, SMTP_* — unverändert mitgeben). Zieht das neue Image; DB-Volume bleibt erhalten, neue Spalten werden via `ensureSchema` beim ersten Zugriff angelegt.

- [ ] **Step 3: Live-Smoke-Test**

Scan einer Domain über die Live-Seite, dann Lead absenden und prüfen, dass die Response `aiAnalysis` mit 3 Dimensionen enthält und der KI-Block im Report erscheint. Projekt-Logs auf Fehler prüfen (`VPS_getProjectLogsV1`).

- [ ] **Step 4: Tag**
```bash
git tag stufe2-live && git push origin stufe2-live
```

---

## Verifikation (Definition of Done)
- `npm test` grün (inkl. neuer `text`- und `analyze`-Tests).
- `npm run build` grün.
- Live: Lead-Unlock liefert eine KI-Analyse mit 3 Dimensionen + Stärken + Empfehlungen + Fazit; der Report zeigt den KI-Block.
- KI-Fehler (kein Key) bricht weder Unlock noch Mailversand; UI zeigt Fallback.
- Headline-Score unverändert (rule-based).
