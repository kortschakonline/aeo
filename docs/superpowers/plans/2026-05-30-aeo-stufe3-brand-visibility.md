# AEO-Tool Stufe 3 — Brand-Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach dem Freischalten in einem separaten, gecachten Schritt prüfen, ob die Marke/Domain in web-gestützten Claude-Antworten auf typische Nutzerfragen auftaucht — mit Visibility-Score, Frage-für-Frage-Aufschlüsselung und genannten Mitbewerbern.

**Architecture:** Neues Modul `src/ai/brand.ts` (`runBrandVisibility` + pure `detectBrand`/`extractAnswer`), Claude mit dem Anthropic-Websuche-Server-Tool, injizierbarer Client für Tests. Eigener Endpoint `POST /api/scan/[id]/brand` (synchron, gecacht). Eigener UI-Block, separat nach dem Unlock geladen. Headline-Score bleibt unverändert.

**Tech Stack:** @anthropic-ai/sdk (web_search tool), zod, Drizzle/Postgres, Next.js, Vitest. Bestehender Stufe-1/2-Code (live).

**Scope:** Nur Stufe 3 laut [Spec](../specs/2026-05-30-aeo-stufe3-brand-visibility-design.md). Eine Engine (Claude+Websuche), kein Headline-Score-Einfluss, keine Accounts.

---

## File Structure
```
src/ai/types.ts          # + BrandVisibility/BrandQuestion/QuestionGen + zod (geändert)
src/ai/brand-prompt.ts   # Prompts + Tool-Schema für Fragen & Antwort (neu)
src/ai/brand.ts          # detectBrand, extractAnswer, runBrandVisibility (neu)
src/db/schema.ts         # + brand_visibility jsonb (geändert)
src/db/migrate.ts        # + ADD COLUMN IF NOT EXISTS (geändert)
src/db/repo.ts           # + saveBrandVisibility (geändert)
app/api/scan/[id]/brand/route.ts  # POST: compute/cache brand visibility (neu)
components/BrandVisibility.tsx     # UI-Block (neu)
components/EmailGate.tsx           # nach Unlock /brand abrufen + rendern (geändert)
tests/brand.test.ts      # detectBrand + runBrandVisibility (neu)
```

---

## Task 1: Brand-Typen & zod

**Files:** Modify `src/ai/types.ts`

- [ ] **Step 1: Typen ergänzen**

Am Ende von `src/ai/types.ts` anfügen:
```ts
export const QuestionGenSchema = z.object({
  brandName: z.string(),
  questions: z.array(z.string()).min(1).max(8),
})
export type QuestionGen = z.infer<typeof QuestionGenSchema>

export const BrandQuestionSchema = z.object({
  question: z.string(),
  appeared: z.boolean(),
  sources: z.array(z.string()),
})
export const BrandVisibilitySchema = z.object({
  brandName: z.string(),
  score: z.number().min(0).max(100),
  questions: z.array(BrandQuestionSchema),
  competitors: z.array(z.string()),
})
export type BrandQuestion = z.infer<typeof BrandQuestionSchema>
export type BrandVisibility = z.infer<typeof BrandVisibilitySchema>
```

- [ ] **Step 2: Verifizieren**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**
```bash
git add src/ai/types.ts && git commit -m "feat(ai): brand-visibility types"
```

---

## Task 2: Prompts & Tool-Schema

**Files:** Create `src/ai/brand-prompt.ts`

- [ ] **Step 1: Implementierung**

Create `src/ai/brand-prompt.ts`:
```ts
export const QUESTION_SYSTEM = `Du unterstützt bei Answer Engine Optimization. Aus dem gegebenen Webseiten-Inhalt und der Domain leitest du ab: den wahrscheinlichen Markennamen des Unternehmens und 3–5 realistische Fragen, die ein potenzieller Kunde einer KI-Assistenz stellen würde, um einen Anbieter wie diesen zu finden — branchen- und, wenn erkennbar, ortsspezifisch. Die Fragen dürfen den Markennamen NICHT enthalten (es geht darum, ob die Marke ungefragt genannt wird). Antworte ausschließlich über das Tool "questions". Alles auf Deutsch.`

export const QUESTION_TOOL = {
  name: 'questions',
  description: 'Markenname + 3–5 markenneutrale Nutzerfragen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      brandName: { type: 'string', description: 'Erkannter Markenname des Unternehmens.' },
      questions: { type: 'array', items: { type: 'string' }, description: '3 bis 5 realistische, markenneutrale Nutzerfragen auf Deutsch.' },
    },
    required: ['brandName', 'questions'],
  },
}

export const ANSWER_SYSTEM = `Du bist eine KI-Antwortmaschine mit Websuche. Beantworte die Nutzerfrage knapp und faktisch auf Basis aktueller Websuche. Wenn passend, nenne konkrete Anbieter/Unternehmen mit Namen.`
```

- [ ] **Step 2: Commit**
```bash
git add src/ai/brand-prompt.ts && git commit -m "feat(ai): brand prompts + question tool schema"
```

---

## Task 3: brand.ts — detectBrand, extractAnswer, runBrandVisibility (TDD)

**Files:** Create `src/ai/brand.ts`; Test `tests/brand.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/brand.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { detectBrand, runBrandVisibility } from '@/src/ai/brand'

describe('detectBrand', () => {
  it('findet Domain in Quellen (ohne www, case-insensitive)', () => {
    expect(detectBrand('irgendein Text', ['https://www.Kortschak.online/x'], 'Egal', 'kortschak.online')).toBe(true)
  })
  it('findet Markennamen im Antworttext', () => {
    expect(detectBrand('Empfehlenswert ist Kortschak Werbeagentur.', [], 'Kortschak', 'andere.tld')).toBe(true)
  })
  it('kein Treffer → false', () => {
    expect(detectBrand('Andere Anbieter X und Y.', ['https://example.com'], 'Kortschak', 'kortschak.online')).toBe(false)
  })
})

// Fake-Client: unterscheidet Frage-Generierung vs. Websuche anhand des Tool-Typs.
function fakeClient() {
  return {
    messages: {
      create: vi.fn(async (params: any) => {
        const toolType = params.tools?.[0]?.type
        if (toolType === 'web_search_20250305') {
          const q: string = params.messages[0].content
          // Marke erscheint nur bei der "Trofaiach"-Frage:
          if (q.includes('Trofaiach')) {
            return { content: [
              { type: 'text', text: 'Ein Anbieter ist Kortschak.', citations: [] },
              { type: 'web_search_tool_result', content: [{ url: 'https://kortschak.online/', title: 'Kortschak' }] },
            ] }
          }
          return { content: [
            { type: 'text', text: 'Anbieter sind Firma A und Firma B.', citations: [] },
            { type: 'web_search_tool_result', content: [{ url: 'https://konkurrent.at/', title: 'Konkurrent' }] },
          ] }
        }
        // Fragen-Generierung
        return { content: [{ type: 'tool_use', name: 'questions', input: {
          brandName: 'Kortschak',
          questions: ['Wer macht Werbetechnik in Trofaiach?', 'Wo bekomme ich Fahrzeugbeschriftung?'],
        } }] }
      }),
    },
  }
}

describe('runBrandVisibility', () => {
  it('berechnet Score, Treffer je Frage und Mitbewerber', async () => {
    const client = fakeClient()
    const r = await runBrandVisibility('Werbeagentur Inhalt', 'kortschak.online', { client, model: 'm' })
    expect(r.brandName).toBe('Kortschak')
    expect(r.questions).toHaveLength(2)
    expect(r.score).toBe(50) // 1 von 2 Fragen
    expect(r.questions[0].appeared).toBe(true)
    expect(r.questions[1].appeared).toBe(false)
    expect(r.competitors).toContain('konkurrent.at')
    expect(r.competitors).not.toContain('kortschak.online')
  })

  it('fängt Fehler einer einzelnen Websuche ab (zählt als nicht erschienen)', async () => {
    const client = {
      messages: {
        create: vi.fn(async (params: any) => {
          if (params.tools?.[0]?.type === 'web_search_20250305') throw new Error('boom')
          return { content: [{ type: 'tool_use', name: 'questions', input: { brandName: 'X', questions: ['F1?'] } }] }
        }),
      },
    }
    const r = await runBrandVisibility('c', 'x.tld', { client, model: 'm' })
    expect(r.score).toBe(0)
    expect(r.questions[0].appeared).toBe(false)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- brand`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

Create `src/ai/brand.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk'
import { QuestionGenSchema, type BrandVisibility, type BrandQuestion } from '@/src/ai/types'
import { QUESTION_SYSTEM, QUESTION_TOOL, ANSWER_SYSTEM } from '@/src/ai/brand-prompt'

interface MessagesClient {
  messages: { create: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ content: Array<Record<string, unknown>> }> }
}
export interface BrandDeps { client?: MessagesClient; model?: string }
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export function detectBrand(answer: string, sources: string[], brandName: string, domain: string): boolean {
  const hay = (answer + ' ' + sources.join(' ')).toLowerCase()
  const dom = domain.replace(/^www\./, '').toLowerCase()
  if (dom && hay.includes(dom)) return true
  const bn = brandName.trim().toLowerCase()
  if (bn && hay.includes(bn)) return true
  return false
}

export function extractAnswer(content: Array<Record<string, unknown>>): { text: string; sources: string[] } {
  let text = ''
  const sources: string[] = []
  for (const b of content) {
    if (b.type === 'text' && typeof b.text === 'string') {
      text += ' ' + b.text
      const citations = (b.citations as Array<{ url?: string }> | undefined) ?? []
      for (const c of citations) if (c?.url) sources.push(String(c.url))
    }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content as Array<{ url?: string; title?: string }>) {
        if (r?.url) sources.push(String(r.url))
        if (r?.title) sources.push(String(r.title))
      }
    }
  }
  return { text: text.trim(), sources }
}

function dedupe(a: string[]): string[] { return [...new Set(a)] }
function domainFromSource(s: string): string {
  try { return new URL(s).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

export async function runBrandVisibility(content: string, domain: string, deps: BrandDeps = {}): Promise<BrandVisibility> {
  const client: MessagesClient = deps.client ?? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient)
  const model = deps.model ?? process.env.BRAND_MODEL ?? DEFAULT_MODEL

  const genRes = await client.messages.create({
    model, max_tokens: 512,
    system: QUESTION_SYSTEM,
    tools: [QUESTION_TOOL],
    tool_choice: { type: 'tool', name: 'questions' },
    messages: [{ role: 'user', content: `Domain: ${domain}\n\nInhalt:\n${content}` }],
  }, { timeout: 30000 })
  const gen = genRes.content.find((b) => b.type === 'tool_use')
  if (!gen) throw new Error('Keine Fragen generiert')
  const { brandName, questions } = QuestionGenSchema.parse((gen as { input: unknown }).input)

  const results: BrandQuestion[] = await Promise.all(questions.map(async (question) => {
    try {
      const res = await client.messages.create({
        model, max_tokens: 1024,
        system: ANSWER_SYSTEM,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: question }],
      }, { timeout: 40000 })
      const { text, sources } = extractAnswer(res.content)
      return { question, appeared: detectBrand(text, sources, brandName, domain), sources: dedupe(sources) }
    } catch {
      return { question, appeared: false, sources: [] }
    }
  }))

  const appeared = results.filter((r) => r.appeared).length
  const score = results.length ? Math.round((100 * appeared) / results.length) : 0
  const dom = domain.replace(/^www\./, '').toLowerCase()
  const competitors = dedupe(
    results.flatMap((r) => r.sources).map(domainFromSource).filter((d) => d !== '' && !d.includes(dom)),
  ).slice(0, 8)

  return { brandName, score, questions: results, competitors }
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- brand`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/ai/brand.ts tests/brand.test.ts && git commit -m "feat(ai): brand visibility via Claude web search"
```

---

## Task 4: DB — Spalte, Migration, Repo

**Files:** Modify `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/repo.ts`

- [ ] **Step 1: Schema**

In `src/db/schema.ts` in der `scans`-Tabelle nach `aiAnalysis: jsonb('ai_analysis'),` ergänzen:
```ts
  brandVisibility: jsonb('brand_visibility'),
```

- [ ] **Step 2: Migration**

In `src/db/migrate.ts` nach den beiden bestehenden ALTER-Statements ergänzen:
```ts
      await db.execute(sql`ALTER TABLE scans ADD COLUMN IF NOT EXISTS brand_visibility jsonb`)
```

- [ ] **Step 3: Repo**

In `src/db/repo.ts`:
(a) Import-Zeile für den Typ ergänzen (zu der bestehenden `import type { AiAnalysis } ...`):
```ts
import type { BrandVisibility } from '@/src/ai/types'
```
(b) Neue Funktion am Dateiende:
```ts
export async function saveBrandVisibility(scanId: number, data: BrandVisibility): Promise<void> {
  await ensureSchema()
  await db.update(scans).set({ brandVisibility: data }).where(eq(scans.id, scanId))
}
```

- [ ] **Step 4: Verifizieren**

Run: `npx tsc --noEmit && npm run build`
Expected: erfolgreich.

- [ ] **Step 5: Commit**
```bash
git add src/db && git commit -m "feat(db): brand_visibility column & saveBrandVisibility"
```

---

## Task 5: API-Endpoint /api/scan/[id]/brand

**Files:** Create `app/api/scan/[id]/brand/route.ts`

- [ ] **Step 1: Implementierung**

Create `app/api/scan/[id]/brand/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getScan, saveBrandVisibility } from '@/src/db/repo'
import { runBrandVisibility } from '@/src/ai/brand'
import type { BrandVisibility } from '@/src/ai/types'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = await getScan(Number(id))
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })

  const cached = (scan.brandVisibility as BrandVisibility | null) ?? null
  if (cached) return NextResponse.json({ brandVisibility: cached, error: false })

  try {
    const data = await runBrandVisibility(scan.contentExcerpt ?? '', scan.domain)
    await saveBrandVisibility(Number(id), data)
    return NextResponse.json({ brandVisibility: data, error: false })
  } catch (e) {
    console.error('Brand-Visibility fehlgeschlagen:', e)
    return NextResponse.json({ brandVisibility: null, error: true })
  }
}
```

- [ ] **Step 2: Verifizieren**

Run: `npx tsc --noEmit && npm run build`
Expected: erfolgreich; Route `/api/scan/[id]/brand` wird als dynamisch gelistet.

- [ ] **Step 3: Commit**
```bash
git add app/api/scan && git commit -m "feat(api): brand-visibility endpoint (cached)"
```

---

## Task 6: UI — Brand-Visibility-Block

**Files:** Create `components/BrandVisibility.tsx`; Modify `components/EmailGate.tsx`

> Präsentationsarbeit; visuelle Abnahme im Browser. Brand-Tokens nutzen (analog `AiAnalysis.tsx`).

- [ ] **Step 1: Komponente**

Create `components/BrandVisibility.tsx` (client-tauglich). Props:
```ts
type Q = { question: string; appeared: boolean; sources: string[] }
export type BrandVisibilityData = { brandName: string; score: number; questions: Q[]; competitors: string[] }
export function BrandVisibility({ data, loading, error }: { data: BrandVisibilityData | null; loading?: boolean; error?: boolean }) { /* ... */ }
```
Verhalten:
- `loading` (und kein `data`): dezenter Lade-Block — Überschrift „KI-Sichtbarkeit" (font-serif) + mono-Zeile „Wir fragen KI-Antwortmaschinen … das dauert einen Moment." mit Spinner/Puls.
- `error` oder (`data` null und nicht `loading`): Fallback „KI-Sichtbarkeit konnte nicht ermittelt werden — wir prüfen das im Erstgespräch." (kein harter Fehler).
- Mit `data`: großer Visibility-Score (font-mono, Farbe wie CategoryCard: ≥80 grün, 50–79 `--brand-light`, <50 `--brand`) + Label „der Testfragen nennen deine Marke". Darunter je Frage eine Zeile: ✓ (brand-light/grün) bzw. ✗ (faint) + Fragetext; bei Treffer optional die Quellen klein in `font-mono`/`text-faint`. Wenn `competitors.length`: ein Block „Stattdessen genannt:" mit den Domains als Chips. Abschlusssatz, der zum Erstgespräch motiviert.
- Responsive, on-brand, konsistent mit `AiAnalysis`.

- [ ] **Step 2: Nach Unlock /brand abrufen**

In `components/EmailGate.tsx`: Es existiert bereits ein `unlocked`-State und das `aiAnalysis`-Handling aus Stufe 2. Ergänze:
- State: `brand: BrandVisibilityData | null`, `brandLoading: boolean`, `brandError: boolean`.
- In einem `useEffect`, der auf `unlocked === true` reagiert (nur einmal): `brandLoading=true`, dann `fetch(`/api/scan/${scanId}/brand`, { method: 'POST' })`, JSON `{ brandVisibility, error }` lesen → `brand = brandVisibility`, `brandError = error || brandVisibility == null`, `brandLoading=false`. Fehler im catch → `brandError=true`, `brandLoading=false`.
- Rendern: `{unlocked && <BrandVisibility data={brand} loading={brandLoading} error={brandError} />}` direkt UNTER dem `<AiAnalysis />`-Block und vor dem finalen CTA.
- `scanId` ist in `EmailGate` bereits als Prop vorhanden (wird für `/api/lead` genutzt). Keine `any` in Props.

- [ ] **Step 3: Verifizieren**

Run: `npm run build`
Expected: erfolgreich. Lokal mit `npm run dev`: nach Freischalten erscheint der KI-Sichtbarkeits-Block (ohne Key/Live-Tool ggf. Fallback — ok).

- [ ] **Step 4: Commit**
```bash
git add components && git commit -m "feat(ui): brand-visibility block, loaded after unlock"
```

---

## Task 7: Deployment

> Reine Infra. Nutzt vorhandenen `ANTHROPIC_API_KEY`; ergänzt `BRAND_MODEL`.

- [ ] **Step 1: Suite grün + Push**

Run: `npm test && npm run build`
Expected: alle Tests grün (inkl. `brand`), Build ok.
Dann nach `master` pushen → GitHub Actions baut & pusht das Image (`gh run watch <id> --exit-status` bis success).

- [ ] **Step 2: VPS-Redeploy**

`VPS_createNewProjectV1` (hostinger-vps, vmId 1478430, projectName "aeo") mit identischer Compose, Environment wie zuvor PLUS:
```
BRAND_MODEL=claude-haiku-4-5-20251001
```
(alle bestehenden Werte — DB_PASS, ANTHROPIC_API_KEY, ANALYSIS_MODEL, NOTIFY_EMAIL, SMTP_* — unverändert mitgeben). Zieht das neue Image; DB-Volume bleibt; neue Spalte via `ensureSchema`.

> Hinweis: Stelle sicher, dass das Websuche-Tool für den Anthropic-Account/Key freigeschaltet ist. Falls die Live-Antwortblöcke eine andere Struktur haben als in `extractAnswer` angenommen, die Quellen-/Citation-Extraktion anhand der echten Antwort anpassen (im Smoke-Test prüfen).

- [ ] **Step 3: Live-Smoke-Test**

Scan einer Domain → Lead absenden (Stufe 2) → dann `POST https://aeo.kortschak.online/api/scan/<id>/brand` aufrufen und prüfen: `brandVisibility` mit `score`, `questions` (3–5), ggf. `competitors`. Im Browser prüfen, dass der Block nach dem Freischalten erscheint. Projekt-Logs auf Fehler prüfen.

- [ ] **Step 4: Tag**
```bash
git tag stufe3-live && git push origin stufe3-live
```

---

## Verifikation (Definition of Done)
- `npm test` grün (inkl. `brand`-Tests).
- `npm run build` grün.
- Live: nach Freischalten lädt der KI-Sichtbarkeits-Block nach und zeigt Score + Fragen + ggf. Mitbewerber.
- Fehler/kein Web-Tool → Fallback, niemals Report-blockierend; gecacht (zweiter Aufruf sofort).
- Headline-Score unverändert.
