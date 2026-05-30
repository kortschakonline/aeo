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
  const brandTokens = brandName.toLowerCase().split(/\s+/).filter((t) => t.length >= 4)
  const isOwn = (d: string) => d.includes(dom) || brandTokens.some((t) => d.includes(t))
  const competitors = dedupe(
    results.flatMap((r) => r.sources).map(domainFromSource).filter((d) => d !== '' && !isOwn(d)),
  ).slice(0, 8)

  return { brandName, score, questions: results, competitors }
}
