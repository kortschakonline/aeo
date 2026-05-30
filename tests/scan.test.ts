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
    expect(typeof r.contentExcerpt).toBe('string')
    expect(r.contentExcerpt!.length).toBeGreaterThan(0)
  })
})
