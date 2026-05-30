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
