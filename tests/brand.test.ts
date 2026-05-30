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

function fakeClient() {
  return {
    messages: {
      create: vi.fn(async (params: any) => {
        const toolType = params.tools?.[0]?.type
        if (toolType === 'web_search_20250305') {
          const q: string = params.messages[0].content
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
    expect(r.score).toBe(50)
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
