import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveLead, getScan, saveAiAnalysis } from '@/src/db/repo'
import { notifyLead } from '@/src/mail/notifier'
import { analyzeContent } from '@/src/ai/analyze'
import type { AiAnalysis } from '@/src/ai/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({ scanId: z.number(), email: z.string().email() })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })

  const scan = await getScan(parsed.data.scanId)
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })

  await saveLead(parsed.data.scanId, parsed.data.email)
  await notifyLead(parsed.data.email, scan.domain, scan.total)

  let aiAnalysis: AiAnalysis | null = (scan.aiAnalysis as AiAnalysis | null) ?? null
  let aiError = false
  if (!aiAnalysis) {
    try {
      aiAnalysis = await analyzeContent(scan.contentExcerpt ?? '')
      await saveAiAnalysis(parsed.data.scanId, aiAnalysis)
    } catch (e) {
      aiError = true
      console.error('KI-Analyse fehlgeschlagen:', e)
    }
  }

  return NextResponse.json({ ok: true, aiAnalysis, aiError })
}
