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
