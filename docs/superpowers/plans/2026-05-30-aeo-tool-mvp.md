# AEO-Tool MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein öffentlich erreichbarer AEO-Scanner unter https://aeo.kortschak.online, der eine Domain regelbasiert prüft, einen Score (0–100) + Kurz-Übersicht frei zeigt und den Detail-Report hinter ein E-Mail-Gate stellt (Lead → DB + Benachrichtigungs-Mail).

**Architecture:** Next.js (App Router, TypeScript) als Fullstack-App. Scan-Engine als reines, getestetes TypeScript-Modul (Fetching + Playwright-Rendering + isolierte Checks + gewichtetes Scoring). PostgreSQL via Drizzle ORM. Deployment als Docker-Container hinter Traefik (Auto-SSL) auf dem VPS.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Drizzle ORM, PostgreSQL, Playwright (Chromium), Vitest (Tests), Nodemailer (Lead-Mail), Docker + docker-compose, Traefik.

**Scope:** Nur MVP (Stufe 1). Claude-Content-Analyse (Stufe 2), Brand-Visibility (Stufe 3), Accounts/Abo (Stufe 4) sind NICHT Teil dieses Plans. Die Kategorie „KI-Sichtbarkeit" wird im Scoring vorbereitet, aber mit Gewicht 0 deaktiviert.

---

## File Structure

```
/Users/jornmartin/AEO/
├─ app/                          # Next.js App Router
│  ├─ layout.tsx                 # Root-Layout, Fonts, globale Styles
│  ├─ page.tsx                   # Single-Page: Hero + Scan + Report (Client-State)
│  ├─ globals.css                # Design-Tokens (Brand-Farben, Fonts)
│  └─ api/
│     ├─ scan/route.ts           # POST: Scan starten
│     ├─ scan/[id]/route.ts      # GET: Status/Ergebnis (Polling)
│     └─ lead/route.ts           # POST: E-Mail-Gate / Lead
├─ src/
│  ├─ engine/
│  │  ├─ url.ts                  # Domain-/URL-Normalisierung
│  │  ├─ fetchers.ts             # robots.txt, sitemap.xml, llms.txt holen
│  │  ├─ render.ts               # Playwright-Rendering der Zielseite
│  │  ├─ types.ts                # ScanContext, CheckResult, ScanResult Typen
│  │  ├─ checks/
│  │  │  ├─ technik.ts           # Meta, OG, Schema.org, Canonical, Lang
│  │  │  ├─ auffindbarkeit.ts    # robots/AI-Bots, llms.txt, sitemap, noindex
│  │  │  └─ content.ts           # H1/Heading-Struktur, FAQ, Listen
│  │  ├─ scoring.ts              # Gewichtung → Kategorie- & Gesamtscore
│  │  └─ scan.ts                 # Orchestrator: context → ScanResult
│  ├─ db/
│  │  ├─ schema.ts               # Drizzle-Schema (scans, scan_checks, leads)
│  │  ├─ client.ts               # DB-Client
│  │  └─ repo.ts                 # save/load Scans & Leads
│  ├─ config/weights.ts          # Kategorie- & Check-Gewichte
│  └─ mail/notifier.ts           # Lead-Benachrichtigung an Kortschak
├─ components/
│  ├─ Hero.tsx                   # URL-Eingabe
│  ├─ ScanProgress.tsx           # Live-Check-Liste (Mono)
│  ├─ ScoreRing.tsx              # SVG-Score-Ring 0–100
│  ├─ CategoryCard.tsx           # Kategorie-Score + Ampel
│  └─ EmailGate.tsx              # Gesperrter Detailbereich + Formular
├─ tests/                        # Vitest-Tests (spiegeln src/engine)
├─ Dockerfile
├─ docker-compose.yml
├─ drizzle.config.ts
├─ .env.example
└─ package.json
```

**Verantwortlichkeiten:** Die `engine/` ist UI- und DB-frei (pure functions, voll testbar). `app/api` ist dünn und ruft Engine + Repo. `components/` sind präsentationsorientiert.

---

## Task 0: Projekt-Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`

- [ ] **Step 1: Next.js + Tailwind scaffolden**

Run im Projektordner `/Users/jornmartin/AEO`:
```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm
```
Bei Nachfrage „directory not empty" → bestehende `docs/`, `.git`, `.gitignore`, `scraped-content/` behalten (zustimmen, vorhandene Dateien nicht überschreiben).

- [ ] **Step 2: Engine-/Test-Abhängigkeiten installieren**

```bash
npm install drizzle-orm postgres playwright nodemailer zod
npm install -D drizzle-kit vitest @types/nodemailer tsx
npx playwright install --with-deps chromium
```

- [ ] **Step 3: Vitest konfigurieren**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: `.env.example` anlegen**

Create `.env.example`:
```
DATABASE_URL=postgres://aeo:aeo@localhost:5432/aeo
ANTHROPIC_API_KEY=
NOTIFY_EMAIL=office@kortschak.online
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: scaffold Next.js + tooling"
```

---

## Task 1: URL-Normalisierung (TDD)

**Files:**
- Create: `src/engine/url.ts`
- Test: `tests/url.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/url.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '@/src/engine/url'

describe('normalizeUrl', () => {
  it('fügt https hinzu, wenn Schema fehlt', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/')
  })
  it('behält Pfad und entfernt Fragment', () => {
    expect(normalizeUrl('http://example.com/a#x')).toBe('http://example.com/a')
  })
  it('wirft bei ungültiger Eingabe', () => {
    expect(() => normalizeUrl('not a url')).toThrow()
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- url`
Expected: FAIL ("normalizeUrl is not a function" / Modul fehlt).

- [ ] **Step 3: Implementierung**

Create `src/engine/url.ts`:
```ts
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const u = new URL(withScheme) // wirft bei ungültiger URL
  if (!/\./.test(u.hostname)) throw new Error('invalid hostname')
  u.hash = ''
  return u.toString()
}

export function domainOf(url: string): string {
  return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- url`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/engine/url.ts tests/url.test.ts && git commit -m "feat(engine): url normalization"
```

---

## Task 2: Engine-Typen

**Files:**
- Create: `src/engine/types.ts`

- [ ] **Step 1: Typen definieren**

Create `src/engine/types.ts`:
```ts
export type Category = 'technik' | 'auffindbarkeit' | 'content' | 'ki_sichtbarkeit'

export interface CheckResult {
  key: string
  category: Category
  score: number        // 0..1
  label: string        // menschenlesbar, z.B. "Schema.org JSON-LD"
  detail: string       // Befund-Text
  fix?: string         // Empfehlung (im Gate)
}

export interface ScanContext {
  url: string
  domain: string
  html: string             // gerendertes DOM-HTML
  robotsTxt: string | null
  sitemapXml: string | null
  llmsTxt: string | null
  responseMs: number
}

export interface CategoryScore { category: Category; score: number } // 0..100

export interface ScanResult {
  url: string
  domain: string
  total: number                 // 0..100
  categories: CategoryScore[]
  checks: CheckResult[]
}
```

- [ ] **Step 2: Commit**
```bash
git add src/engine/types.ts && git commit -m "feat(engine): result types"
```

---

## Task 3: Auffindbarkeits-Checks (TDD)

**Files:**
- Create: `src/engine/checks/auffindbarkeit.ts`
- Test: `tests/auffindbarkeit.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/auffindbarkeit.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { auffindbarkeitChecks } from '@/src/engine/checks/auffindbarkeit'
import type { ScanContext } from '@/src/engine/types'

const base: ScanContext = {
  url: 'https://x.com/', domain: 'x.com', html: '<html></html>',
  robotsTxt: null, sitemapXml: null, llmsTxt: null, responseMs: 100,
}

describe('auffindbarkeitChecks', () => {
  it('llms.txt fehlt → score 0', () => {
    const r = auffindbarkeitChecks(base).find(c => c.key === 'llms_txt')!
    expect(r.score).toBe(0)
  })
  it('llms.txt vorhanden → score 1', () => {
    const r = auffindbarkeitChecks({ ...base, llmsTxt: '# Site' }).find(c => c.key === 'llms_txt')!
    expect(r.score).toBe(1)
  })
  it('robots blockiert GPTBot → ai_crawlers score 0', () => {
    const robots = 'User-agent: GPTBot\nDisallow: /'
    const r = auffindbarkeitChecks({ ...base, robotsTxt: robots }).find(c => c.key === 'ai_crawlers')!
    expect(r.score).toBe(0)
  })
  it('robots ohne KI-Block → ai_crawlers score 1', () => {
    const r = auffindbarkeitChecks({ ...base, robotsTxt: 'User-agent: *\nAllow: /' }).find(c => c.key === 'ai_crawlers')!
    expect(r.score).toBe(1)
  })
  it('noindex im HTML → indexable score 0', () => {
    const html = '<meta name="robots" content="noindex">'
    const r = auffindbarkeitChecks({ ...base, html }).find(c => c.key === 'indexable')!
    expect(r.score).toBe(0)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- auffindbarkeit` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

Create `src/engine/checks/auffindbarkeit.ts`:
```ts
import type { CheckResult, ScanContext } from '@/src/engine/types'

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot']

function blocksBot(robots: string, bot: string): boolean {
  const lines = robots.split('\n').map(l => l.trim())
  let active = false
  for (const line of lines) {
    const m = /^user-agent:\s*(.+)$/i.exec(line)
    if (m) { active = m[1].trim().toLowerCase() === bot.toLowerCase() || m[1].trim() === '*'; continue }
    if (active && /^disallow:\s*\/\s*$/i.test(line)) return true
  }
  return false
}

export function auffindbarkeitChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'auffindbarkeit', score, label, detail, fix })

  const robots = ctx.robotsTxt ?? ''
  const blockedBots = AI_BOTS.filter(b => robots && blocksBot(robots, b))
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(ctx.html)

  return [
    c('llms_txt', ctx.llmsTxt ? 1 : 0, 'llms.txt',
      ctx.llmsTxt ? 'llms.txt vorhanden.' : 'Keine llms.txt gefunden.',
      'Lege eine llms.txt im Root an, die KI-Systemen Struktur & wichtige Inhalte erklärt.'),
    c('robots_txt', ctx.robotsTxt ? 1 : 0, 'robots.txt',
      ctx.robotsTxt ? 'robots.txt vorhanden.' : 'Keine robots.txt gefunden.',
      'Lege eine robots.txt an und referenziere die Sitemap.'),
    c('ai_crawlers', blockedBots.length ? 0 : 1, 'KI-Crawler-Zugriff',
      blockedBots.length ? `Blockiert: ${blockedBots.join(', ')}.` : 'KI-Crawler werden nicht blockiert.',
      'Erlaube GPTBot, ClaudeBot, PerplexityBot & Google-Extended in robots.txt.'),
    c('sitemap', ctx.sitemapXml ? 1 : 0, 'Sitemap',
      ctx.sitemapXml ? 'sitemap.xml vorhanden.' : 'Keine sitemap.xml gefunden.',
      'Erzeuge eine sitemap.xml und verlinke sie in robots.txt.'),
    c('indexable', noindex ? 0 : 1, 'Indexierbarkeit',
      noindex ? 'Seite ist auf noindex gesetzt.' : 'Seite ist indexierbar.',
      'Entferne das noindex-Meta-Tag auf wichtigen Seiten.'),
  ]
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- auffindbarkeit` → PASS (5 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/engine/checks/auffindbarkeit.ts tests/auffindbarkeit.test.ts && git commit -m "feat(engine): auffindbarkeit checks"
```

---

## Task 4: Technik-Checks (TDD)

**Files:**
- Create: `src/engine/checks/technik.ts`
- Test: `tests/technik.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/technik.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { technikChecks } from '@/src/engine/checks/technik'
import type { ScanContext } from '@/src/engine/types'

const ctx = (html: string, responseMs = 300): ScanContext => ({
  url: 'https://x.com/', domain: 'x.com', html,
  robotsTxt: null, sitemapXml: null, llmsTxt: null, responseMs,
})

describe('technikChecks', () => {
  it('Title vorhanden → title score 1', () => {
    const r = technikChecks(ctx('<title>Hallo Welt Seite</title>')).find(c => c.key === 'title')!
    expect(r.score).toBe(1)
  })
  it('Title fehlt → title score 0', () => {
    const r = technikChecks(ctx('<html></html>')).find(c => c.key === 'title')!
    expect(r.score).toBe(0)
  })
  it('JSON-LD vorhanden → schema score 1', () => {
    const html = '<script type="application/ld+json">{"@type":"Organization"}</script>'
    const r = technikChecks(ctx(html)).find(c => c.key === 'schema')!
    expect(r.score).toBe(1)
  })
  it('Meta description vorhanden → description score 1', () => {
    const html = '<meta name="description" content="Eine ausreichend lange Beschreibung der Seite hier.">'
    const r = technikChecks(ctx(html)).find(c => c.key === 'description')!
    expect(r.score).toBe(1)
  })
  it('langsame Antwort → performance < 1', () => {
    const r = technikChecks(ctx('<title>x</title>', 5000)).find(c => c.key === 'performance')!
    expect(r.score).toBeLessThan(1)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- technik` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/engine/checks/technik.ts`:
```ts
import type { CheckResult, ScanContext } from '@/src/engine/types'

export function technikChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'technik', score, label, detail, fix })
  const h = ctx.html

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(h)
  const title = titleMatch?.[1]?.trim() ?? ''
  const descMatch = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(h)
  const desc = descMatch?.[1]?.trim() ?? ''
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(h)
  const hasOg = /<meta[^>]+property=["']og:title["']/i.test(h)
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(h)
  const hasLang = /<html[^>]+lang=/i.test(h)
  const perf = ctx.responseMs <= 800 ? 1 : ctx.responseMs >= 4000 ? 0.2 : 1 - (ctx.responseMs - 800) / 4000

  return [
    c('title', title.length >= 10 ? 1 : title ? 0.5 : 0, 'Seitentitel',
      title ? `Title: "${title}".` : 'Kein <title> gefunden.',
      'Setze einen aussagekräftigen Title (30–60 Zeichen).'),
    c('description', desc.length >= 50 ? 1 : desc ? 0.5 : 0, 'Meta-Description',
      desc ? 'Description vorhanden.' : 'Keine Meta-Description.',
      'Ergänze eine Description mit 120–160 Zeichen.'),
    c('schema', hasJsonLd ? 1 : 0, 'Schema.org (JSON-LD)',
      hasJsonLd ? 'Strukturierte Daten gefunden.' : 'Keine JSON-LD strukturierten Daten.',
      'Füge JSON-LD hinzu (Organization, Article, FAQ, Product …).'),
    c('opengraph', hasOg ? 1 : 0, 'OpenGraph',
      hasOg ? 'OG-Tags vorhanden.' : 'Keine OpenGraph-Tags.',
      'Ergänze og:title, og:description, og:image.'),
    c('canonical', hasCanonical ? 1 : 0, 'Canonical',
      hasCanonical ? 'Canonical-Tag vorhanden.' : 'Kein Canonical-Tag.',
      'Setze ein rel=canonical pro Seite.'),
    c('lang', hasLang ? 1 : 0, 'Sprach-Auszeichnung',
      hasLang ? 'lang-Attribut gesetzt.' : 'Kein lang-Attribut am <html>.',
      'Setze <html lang="de">.'),
    c('performance', Number(perf.toFixed(2)), 'Antwortzeit',
      `Server-Antwort in ${ctx.responseMs} ms.`,
      'Optimiere Ladezeit (Caching, Bildgrößen, weniger Render-Blocking).'),
  ]
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- technik` → PASS (5 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/engine/checks/technik.ts tests/technik.test.ts && git commit -m "feat(engine): technik checks"
```

---

## Task 5: Content-Checks (TDD)

**Files:**
- Create: `src/engine/checks/content.ts`
- Test: `tests/content.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/content.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { contentChecks } from '@/src/engine/checks/content'
import type { ScanContext } from '@/src/engine/types'

const ctx = (html: string): ScanContext => ({
  url: 'https://x.com/', domain: 'x.com', html,
  robotsTxt: null, sitemapXml: null, llmsTxt: null, responseMs: 100,
})

describe('contentChecks', () => {
  it('genau eine H1 → h1 score 1', () => {
    const r = contentChecks(ctx('<h1>Titel</h1><h2>Sub</h2>')).find(c => c.key === 'h1')!
    expect(r.score).toBe(1)
  })
  it('keine H1 → h1 score 0', () => {
    const r = contentChecks(ctx('<p>nix</p>')).find(c => c.key === 'h1')!
    expect(r.score).toBe(0)
  })
  it('mehrere H1 → h1 score 0.5', () => {
    const r = contentChecks(ctx('<h1>A</h1><h1>B</h1>')).find(c => c.key === 'h1')!
    expect(r.score).toBe(0.5)
  })
  it('FAQ-Schema → faq score 1', () => {
    const html = '<script type="application/ld+json">{"@type":"FAQPage"}</script>'
    const r = contentChecks(ctx(html)).find(c => c.key === 'faq')!
    expect(r.score).toBe(1)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- content` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/engine/checks/content.ts`:
```ts
import type { CheckResult, ScanContext } from '@/src/engine/types'

export function contentChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'content', score, label, detail, fix })
  const h = ctx.html

  const h1Count = (h.match(/<h1[\s>]/gi) ?? []).length
  const h2Count = (h.match(/<h2[\s>]/gi) ?? []).length
  const hasFaq = /"@type"\s*:\s*"FAQPage"/i.test(h) || /itemtype=["'][^"']*FAQPage/i.test(h)
  const listCount = (h.match(/<(ul|ol|table)[\s>]/gi) ?? []).length
  const h1Score = h1Count === 1 ? 1 : h1Count === 0 ? 0 : 0.5

  return [
    c('h1', h1Score, 'H1-Überschrift',
      h1Count === 1 ? 'Genau eine H1.' : h1Count === 0 ? 'Keine H1 gefunden.' : `${h1Count} H1-Tags (sollte 1 sein).`,
      'Verwende genau eine klare H1 pro Seite.'),
    c('headings', h2Count >= 2 ? 1 : h2Count === 1 ? 0.5 : 0, 'Heading-Struktur',
      `${h2Count} H2-Abschnitte.`,
      'Gliedere Inhalte mit mehreren frage-orientierten H2-Überschriften.'),
    c('faq', hasFaq ? 1 : 0, 'FAQ / Q&A',
      hasFaq ? 'FAQ-Markup gefunden.' : 'Kein FAQ-Markup.',
      'Ergänze einen FAQ-Abschnitt mit FAQPage-Schema — ideal für KI-Antworten.'),
    c('lists', listCount >= 1 ? 1 : 0, 'Listen & Tabellen',
      `${listCount} Listen/Tabellen.`,
      'Nutze Listen/Tabellen — KI zitiert strukturierte Inhalte leichter.'),
  ]
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- content` → PASS (4 Tests).

- [ ] **Step 5: Commit**
```bash
git add src/engine/checks/content.ts tests/content.test.ts && git commit -m "feat(engine): content checks"
```

---

## Task 6: Scoring + Gewichte (TDD)

**Files:**
- Create: `src/config/weights.ts`, `src/engine/scoring.ts`
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: Gewichte-Config**

Create `src/config/weights.ts`:
```ts
import type { Category } from '@/src/engine/types'

// MVP: ki_sichtbarkeit deaktiviert (0). Normalisierung über aktive Kategorien.
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  technik: 35,
  auffindbarkeit: 35,
  content: 30,
  ki_sichtbarkeit: 0,
}
```

- [ ] **Step 2: Failing test**

Create `tests/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { scoreScan } from '@/src/engine/scoring'
import type { CheckResult } from '@/src/engine/types'

const mk = (category: any, score: number, key: string): CheckResult =>
  ({ key, category, score, label: key, detail: '' })

describe('scoreScan', () => {
  it('alle Checks perfekt → total 100', () => {
    const checks = [mk('technik',1,'a'), mk('auffindbarkeit',1,'b'), mk('content',1,'c')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    expect(r.total).toBe(100)
  })
  it('deaktivierte Kategorie zählt nicht', () => {
    const checks = [mk('technik',1,'a'), mk('auffindbarkeit',1,'b'), mk('content',1,'c'), mk('ki_sichtbarkeit',0,'d')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    expect(r.total).toBe(100) // ki_sichtbarkeit (Gewicht 0) ignoriert
  })
  it('Kategorie-Score ist Mittelwert der Checks × 100', () => {
    const checks = [mk('technik',0.5,'a'), mk('technik',1,'b'), mk('auffindbarkeit',1,'c'), mk('content',1,'d')]
    const r = scoreScan('https://x.com/', 'x.com', checks)
    const technik = r.categories.find(c => c.category === 'technik')!
    expect(technik.score).toBe(75)
  })
})
```

- [ ] **Step 3: Test schlägt fehl**

Run: `npm test -- scoring` → FAIL.

- [ ] **Step 4: Implementierung**

Create `src/engine/scoring.ts`:
```ts
import type { CheckResult, ScanResult, Category, CategoryScore } from '@/src/engine/types'
import { CATEGORY_WEIGHTS } from '@/src/config/weights'

export function scoreScan(url: string, domain: string, checks: CheckResult[]): ScanResult {
  const cats: Category[] = ['technik', 'auffindbarkeit', 'content', 'ki_sichtbarkeit']
  const categories: CategoryScore[] = cats.map(category => {
    const inCat = checks.filter(c => c.category === category)
    const avg = inCat.length ? inCat.reduce((s, c) => s + c.score, 0) / inCat.length : 0
    return { category, score: Math.round(avg * 100) }
  })

  let weightSum = 0, acc = 0
  for (const cs of categories) {
    const w = CATEGORY_WEIGHTS[cs.category]
    if (w <= 0) continue
    weightSum += w
    acc += cs.score * w
  }
  const total = weightSum ? Math.round(acc / weightSum) : 0
  return { url, domain, total, categories, checks }
}
```

- [ ] **Step 5: Test grün**

Run: `npm test -- scoring` → PASS (3 Tests).

- [ ] **Step 6: Commit**
```bash
git add src/config/weights.ts src/engine/scoring.ts tests/scoring.test.ts && git commit -m "feat(engine): weighted scoring"
```

---

## Task 7: Fetchers (robots/sitemap/llms) (TDD mit injiziertem fetch)

**Files:**
- Create: `src/engine/fetchers.ts`
- Test: `tests/fetchers.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/fetchers.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fetchAuxFiles } from '@/src/engine/fetchers'

function fakeFetch(map: Record<string, string>) {
  return async (url: string) => {
    const body = map[url]
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404,
             text: async () => body ?? '' } as Response
  }
}

describe('fetchAuxFiles', () => {
  it('holt vorhandene Dateien, null bei 404', async () => {
    const f = fakeFetch({
      'https://x.com/robots.txt': 'User-agent: *',
      'https://x.com/llms.txt': '# Site',
    })
    const r = await fetchAuxFiles('https://x.com/', f)
    expect(r.robotsTxt).toBe('User-agent: *')
    expect(r.llmsTxt).toBe('# Site')
    expect(r.sitemapXml).toBeNull()
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- fetchers` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/engine/fetchers.ts`:
```ts
type FetchFn = (url: string) => Promise<Response>

async function get(url: string, fetchFn: FetchFn): Promise<string | null> {
  try {
    const res = await fetchFn(url)
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

export async function fetchAuxFiles(url: string, fetchFn: FetchFn = fetch) {
  const origin = new URL(url).origin
  const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    get(`${origin}/robots.txt`, fetchFn),
    get(`${origin}/sitemap.xml`, fetchFn),
    get(`${origin}/llms.txt`, fetchFn),
  ])
  return { robotsTxt, sitemapXml, llmsTxt }
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- fetchers` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/engine/fetchers.ts tests/fetchers.test.ts && git commit -m "feat(engine): aux file fetchers"
```

---

## Task 8: Playwright-Rendering

**Files:**
- Create: `src/engine/render.ts`

> Kein Unit-Test (echter Browser, I/O). Wird im Orchestrator-Smoke-Test (Task 9) indirekt geprüft.

- [ ] **Step 1: Implementierung**

Create `src/engine/render.ts`:
```ts
import { chromium } from 'playwright'

export interface RenderOutput { html: string; responseMs: number }

export async function renderPage(url: string): Promise<RenderOutput> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (AEO-Scanner; +https://aeo.kortschak.online)' })
    const start = Date.now()
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })
    const responseMs = Date.now() - start
    void resp
    const html = await page.content()
    return { html, responseMs }
  } finally {
    await browser.close()
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add src/engine/render.ts && git commit -m "feat(engine): playwright rendering"
```

---

## Task 9: Scan-Orchestrator (TDD mit injizierten I/O-Funktionen)

**Files:**
- Create: `src/engine/scan.ts`
- Test: `tests/scan.test.ts`

- [ ] **Step 1: Failing test**

Create `tests/scan.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { runScan } from '@/src/engine/scan'

describe('runScan', () => {
  it('orchestriert Render + Fetch + Checks + Scoring', async () => {
    const deps = {
      render: async () => ({ html: '<html lang="de"><title>Test Seite lang genug</title><h1>Hi</h1><h2>A</h2><h2>B</h2><ul><li>x</li></ul></html>', responseMs: 200 }),
      fetchAux: async () => ({ robotsTxt: 'User-agent: *\nAllow: /', sitemapXml: '<urlset/>', llmsTxt: '# Site' }),
    }
    const r = await runScan('example.com', deps)
    expect(r.domain).toBe('example.com')
    expect(r.total).toBeGreaterThan(0)
    expect(r.total).toBeLessThanOrEqual(100)
    expect(r.categories).toHaveLength(4)
    expect(r.checks.length).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npm test -- scan` → FAIL.

- [ ] **Step 3: Implementierung**

Create `src/engine/scan.ts`:
```ts
import { normalizeUrl, domainOf } from '@/src/engine/url'
import { renderPage, type RenderOutput } from '@/src/engine/render'
import { fetchAuxFiles } from '@/src/engine/fetchers'
import { technikChecks } from '@/src/engine/checks/technik'
import { auffindbarkeitChecks } from '@/src/engine/checks/auffindbarkeit'
import { contentChecks } from '@/src/engine/checks/content'
import { scoreScan } from '@/src/engine/scoring'
import type { ScanContext, ScanResult } from '@/src/engine/types'

export interface ScanDeps {
  render?: (url: string) => Promise<RenderOutput>
  fetchAux?: (url: string) => Promise<{ robotsTxt: string|null; sitemapXml: string|null; llmsTxt: string|null }>
}

export async function runScan(input: string, deps: ScanDeps = {}): Promise<ScanResult> {
  const render = deps.render ?? renderPage
  const fetchAux = deps.fetchAux ?? fetchAuxFiles
  const url = normalizeUrl(input)
  const domain = domainOf(url)

  const [{ html, responseMs }, aux] = await Promise.all([render(url), fetchAux(url)])
  const ctx: ScanContext = { url, domain, html, responseMs, ...aux }

  const checks = [...technikChecks(ctx), ...auffindbarkeitChecks(ctx), ...contentChecks(ctx)]
  return scoreScan(url, domain, checks)
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- scan` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/engine/scan.ts tests/scan.test.ts && git commit -m "feat(engine): scan orchestrator"
```

---

## Task 10: DB-Schema & Repo (Drizzle)

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/repo.ts`, `drizzle.config.ts`

- [ ] **Step 1: Schema**

Create `src/db/schema.ts`:
```ts
import { pgTable, serial, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const scans = pgTable('scans', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  domain: text('domain').notNull(),
  total: integer('total').notNull(),
  categories: jsonb('categories').notNull(),
  checks: jsonb('checks').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  scanId: integer('scan_id').references(() => scans.id).notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  notifiedAt: timestamp('notified_at'),
})
```

- [ ] **Step 2: Client**

Create `src/db/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const queryClient = postgres(process.env.DATABASE_URL!)
export const db = drizzle(queryClient)
```

- [ ] **Step 3: Repo**

Create `src/db/repo.ts`:
```ts
import { db } from '@/src/db/client'
import { scans, leads } from '@/src/db/schema'
import { eq } from 'drizzle-orm'
import type { ScanResult } from '@/src/engine/types'

export async function saveScan(r: ScanResult): Promise<number> {
  const [row] = await db.insert(scans).values({
    url: r.url, domain: r.domain, total: r.total,
    categories: r.categories, checks: r.checks,
  }).returning({ id: scans.id })
  return row.id
}

export async function getScan(id: number) {
  const [row] = await db.select().from(scans).where(eq(scans.id, id))
  return row ?? null
}

export async function saveLead(scanId: number, email: string): Promise<number> {
  const [row] = await db.insert(leads).values({ scanId, email }).returning({ id: leads.id })
  return row.id
}
```

- [ ] **Step 4: Drizzle-Config + Migration**

Create `drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```
Add `package.json` script: `"db:push": "drizzle-kit push"`. (Migration wird beim Deploy/lokal mit laufender DB ausgeführt — Task 14.)

- [ ] **Step 5: Commit**
```bash
git add src/db drizzle.config.ts package.json && git commit -m "feat(db): drizzle schema + repo"
```

---

## Task 11: Lead-Notifier

**Files:**
- Create: `src/mail/notifier.ts`

- [ ] **Step 1: Implementierung**

Create `src/mail/notifier.ts`:
```ts
import nodemailer from 'nodemailer'

export async function notifyLead(email: string, domain: string, total: number): Promise<void> {
  if (!process.env.SMTP_HOST) { console.warn('SMTP nicht konfiguriert, überspringe Mail'); return }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `Neuer AEO-Lead: ${domain} (Score ${total})`,
    text: `E-Mail: ${email}\nDomain: ${domain}\nScore: ${total}/100`,
  })
}
```

- [ ] **Step 2: Commit**
```bash
git add src/mail/notifier.ts && git commit -m "feat(mail): lead notifier"
```

---

## Task 12: API-Routen

**Files:**
- Create: `app/api/scan/route.ts`, `app/api/scan/[id]/route.ts`, `app/api/lead/route.ts`

- [ ] **Step 1: Scan starten**

Create `app/api/scan/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runScan } from '@/src/engine/scan'
import { saveScan } from '@/src/db/repo'

export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({ url: z.string().min(3) })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige URL' }, { status: 400 })
  try {
    const result = await runScan(parsed.data.url)
    const id = await saveScan(result)
    return NextResponse.json({ id, result })
  } catch (e) {
    return NextResponse.json({ error: 'Scan fehlgeschlagen', detail: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Scan abrufen**

Create `app/api/scan/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getScan } from '@/src/db/repo'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getScan(Number(id))
  if (!row) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 })
  return NextResponse.json(row)
}
```

- [ ] **Step 3: Lead**

Create `app/api/lead/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveLead, getScan } from '@/src/db/repo'
import { notifyLead } from '@/src/mail/notifier'

const Body = z.object({ scanId: z.number(), email: z.string().email() })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const scan = await getScan(parsed.data.scanId)
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })
  await saveLead(parsed.data.scanId, parsed.data.email)
  await notifyLead(parsed.data.email, scan.domain, scan.total)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich (Type-Check grün).

- [ ] **Step 5: Commit**
```bash
git add app/api && git commit -m "feat(api): scan + lead endpoints"
```

---

## Task 13: Design-Tokens & Fonts

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`

- [ ] **Step 1: Tokens in globals.css**

Ersetze den Inhalt von `app/globals.css` mit Tailwind-Direktiven + den Brand-Tokens aus der Spec (`:root` Block: `--bg #0d0d0b`, `--bg-soft #141412`, `--surface #1a1a17`, `--ink #f5f4ee`, `--muted #9a9892`, `--faint #5b5a55`, `--brand #ff1c20`, `--brand-light #f18700`, `--brand-alt #cc1418`, `--line rgba(245,244,238,0.08)`). Body: `background var(--bg)`, `color var(--ink)`, `font-family Inter Tight`. Grain-Overlay via `body::before` (aus `docs/design/Farbdesign — Kortschak Schriften.html` übernehmen).

- [ ] **Step 2: Fonts laden**

In `app/layout.tsx` via `next/font/google`: Fraunces, Inter Tight, JetBrains Mono als CSS-Variablen (`--font-serif`, `--font-sans`, `--font-mono`) am `<html>`. Tailwind-`fontFamily` in `tailwind.config.ts` darauf mappen (`serif`, `sans`, `mono`). Logo (helle SVG) nach `public/logo.svg` aus dem GitHub-Repo kopieren.

- [ ] **Step 3: Build prüfen**

Run: `npm run build` → grün.

- [ ] **Step 4: Commit**
```bash
git add app/globals.css app/layout.tsx tailwind.config.ts public/logo.svg && git commit -m "feat(ui): brand tokens + fonts"
```

---

## Task 14: UI-Komponenten & Single-Page

**Files:**
- Create: `components/Hero.tsx`, `components/ScanProgress.tsx`, `components/ScoreRing.tsx`, `components/CategoryCard.tsx`, `components/EmailGate.tsx`
- Modify: `app/page.tsx`

> Diese Komponenten sind präsentationsorientiert; visuelle Abnahme erfolgt im Browser (Task 16), nicht per Unit-Test.

- [ ] **Step 1: ScoreRing**

Create `components/ScoreRing.tsx`: SVG-Kreis, Umfang via `2πr`, `stroke-dashoffset` nach `score/100`, Gradient `--brand` → `--brand-light`. Score-Zahl zentriert in JetBrains Mono. Props: `{ score: number }`.

- [ ] **Step 2: CategoryCard**

Create `components/CategoryCard.tsx`: Props `{ label: string; score: number }`. Ampel: ≥80 grün-ish (brand-light), 50–79 orange, <50 brand-rot. Score in Mono, Label in Sans, Karte auf `--surface` mit `--line`-Rand.

- [ ] **Step 3: ScanProgress**

Create `components/ScanProgress.tsx`: Props `{ running: boolean }`. Zeigt während des Scans eine Mono-Liste der Check-Labels, die nacheinander mit ✓/✗ „eintrudeln" (zeitgesteuerte Animation als UX-Effekt, da der echte Scan ein einzelner Request ist).

- [ ] **Step 4: EmailGate**

Create `components/EmailGate.tsx`: Props `{ scanId: number; onUnlock: () => void }`. Unscharfer Detailbereich (CSS `blur` + Overlay), E-Mail-Feld + Button → `POST /api/lead`. Bei Erfolg `onUnlock()`. CTA-Block „kostenloses Erstgespräch".

- [ ] **Step 5: Hero**

Create `components/Hero.tsx`: Props `{ onScan: (url: string) => void; loading: boolean }`. Fraunces-Headline „Findet die KI deine Website?", URL-Input + Button, Vertrauens-Zeile.

- [ ] **Step 6: page.tsx verdrahten**

Ersetze `app/page.tsx` (Client Component): State-Maschine `idle → scanning → result`. `onScan` ruft `POST /api/scan`, speichert Ergebnis, zeigt `ScoreRing` + 4 `CategoryCard`s (frei) + `EmailGate` (Details gesperrt). Kategorie-Labels: Technik, Auffindbarkeit, Content, KI-Sichtbarkeit (letztere als „bald" markiert, da Gewicht 0).

- [ ] **Step 7: Build prüfen**

Run: `npm run build` → grün.

- [ ] **Step 8: Commit**
```bash
git add components app/page.tsx && git commit -m "feat(ui): hero, scan progress, report, email gate"
```

---

## Task 15: Docker + Compose

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: Dockerfile**

Create `Dockerfile` (Basis `mcr.microsoft.com/playwright:v1.49.0-noble` für Chromium-Deps):
```dockerfile
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```
In `next.config.ts`: `output: 'standalone'` setzen (kleineres Image; alternativ obiges einfaches CMD belassen).

- [ ] **Step 2: .dockerignore**

Create `.dockerignore`:
```
node_modules
.next
.git
docs
scraped-content
.env*
```

- [ ] **Step 3: docker-compose mit Traefik-Labels**

Create `docker-compose.yml`:
```yaml
services:
  app:
    build: .
    environment:
      - DATABASE_URL=postgres://aeo:${DB_PASS}@db:5432/aeo
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NOTIFY_EMAIL=${NOTIFY_EMAIL}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    depends_on: [db]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.aeo.rule=Host(`aeo.kortschak.online`)"
      - "traefik.http.routers.aeo.entrypoints=websecure"
      - "traefik.http.routers.aeo.tls.certresolver=letsencrypt"
      - "traefik.http.services.aeo.loadbalancer.server.port=3000"
    networks: [web, internal]
  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=aeo
      - POSTGRES_PASSWORD=${DB_PASS}
      - POSTGRES_DB=aeo
    volumes: [aeo-db:/var/lib/postgresql/data]
    networks: [internal]
volumes:
  aeo-db:
networks:
  web:
    external: true
  internal: {}
```
> Hinweis: Netzwerk-/Certresolver-Namen müssen zur bestehenden Traefik-Installation auf dem VPS passen — in Task 16 prüfen und ggf. anpassen.

- [ ] **Step 4: Commit**
```bash
git add Dockerfile docker-compose.yml .dockerignore next.config.ts && git commit -m "chore: docker + compose with traefik labels"
```

---

## Task 16: Deployment auf VPS

> Ausführung über `hostinger-vps` MCP bzw. SSH auf 72.62.145.101. Keine Code-Änderung, reine Infra.

- [ ] **Step 1: DNS-Eintrag**

A-Record `aeo.kortschak.online` → `72.62.145.101` setzen (hostinger-vps MCP: `DNS_updateDNSRecordsV1` für Zone `kortschak.online`). Mit `DNS_getDNSRecordsV1` verifizieren.

- [ ] **Step 2: Traefik-Setup prüfen**

Auf dem VPS bestehende Traefik-Config inspizieren: Name des externen Netzwerks (`web`?), Name des Certresolvers (`letsencrypt`?), Entrypoint (`websecure`?). `docker-compose.yml` an die echten Namen anpassen.

- [ ] **Step 3: Code auf VPS bringen & starten**

Repo auf den VPS klonen/kopieren, `.env` mit echten Werten (DB_PASS, ANTHROPIC_API_KEY, SMTP_*, NOTIFY_EMAIL) anlegen, dann:
```bash
docker compose up -d --build
docker compose exec app npm run db:push   # Schema in Postgres anlegen
```

- [ ] **Step 4: Smoke-Test live**

`https://aeo.kortschak.online` aufrufen (gültiges SSL), eine Test-Domain scannen, Score + Kategorien sehen, E-Mail-Gate testen, Benachrichtigungs-Mail prüfen. Mit Browser-MCP (Playwright/Chrome) Screenshot zur Abnahme.

- [ ] **Step 5: Final commit / Tag**
```bash
git add -A && git commit -m "chore: deployment config finalized" && git tag mvp-live
```

---

## Verifikation (Definition of Done)
- `npm test` grün (alle Engine-Tests).
- `npm run build` grün.
- `https://aeo.kortschak.online` live mit gültigem SSL.
- Scan einer echten Domain liefert plausiblen Score + 4 Kategorien.
- E-Mail-Gate speichert Lead in DB und schickt Benachrichtigung an `NOTIFY_EMAIL`.
- „KI-Sichtbarkeit" sichtbar als vorbereitete, aber deaktivierte Kategorie (Gewicht 0).
