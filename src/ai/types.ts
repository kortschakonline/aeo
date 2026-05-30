import { z } from 'zod'

export const AiDimensionSchema = z.object({
  key: z.enum(['klarheit', 'zitierfaehigkeit', 'antwortorientierung']),
  score: z.number().min(0).max(100),
  summary: z.string(),
})

export const AiAnalysisSchema = z.object({
  dimensions: z.array(AiDimensionSchema).length(3),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  overallSummary: z.string(),
})

export type AiDimension = z.infer<typeof AiDimensionSchema>
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>
