import Anthropic from '@anthropic-ai/sdk'
import { AiAnalysisSchema, type AiAnalysis } from '@/src/ai/types'
import { SYSTEM_PROMPT, REPORT_TOOL } from '@/src/ai/prompt'

interface MessagesClient {
  messages: { create: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ content: Array<{ type: string; name?: string; input?: unknown }> }> }
}

export interface AnalyzeDeps {
  client?: MessagesClient
  model?: string
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export async function analyzeContent(text: string, deps: AnalyzeDeps = {}): Promise<AiAnalysis> {
  const client: MessagesClient = deps.client ?? (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient)
  const model = deps.model ?? process.env.ANALYSIS_MODEL ?? DEFAULT_MODEL

  const res = await client.messages.create(
    {
      model,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report' },
      messages: [{ role: 'user', content: `Analysiere diesen Seiteninhalt für AEO:\n\n${text}` }],
    },
    { timeout: 30000 },
  )

  const block = res.content.find((b) => b.type === 'tool_use')
  if (!block || block.input === undefined) throw new Error('Keine tool_use-Antwort von Claude')
  return AiAnalysisSchema.parse(block.input)
}
