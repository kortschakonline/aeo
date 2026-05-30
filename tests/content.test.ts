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
