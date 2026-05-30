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
