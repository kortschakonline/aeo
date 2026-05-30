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
