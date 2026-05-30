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

export const QuestionGenSchema = z.object({
  brandName: z.string(),
  questions: z.array(z.string()).min(1).max(8),
})
export type QuestionGen = z.infer<typeof QuestionGenSchema>

export const BrandQuestionSchema = z.object({
  question: z.string(),
  appeared: z.boolean(),
  sources: z.array(z.string()),
})
export const BrandVisibilitySchema = z.object({
  brandName: z.string(),
  score: z.number().min(0).max(100),
  questions: z.array(BrandQuestionSchema),
  competitors: z.array(z.string()),
})
export type BrandQuestion = z.infer<typeof BrandQuestionSchema>
export type BrandVisibility = z.infer<typeof BrandVisibilitySchema>
