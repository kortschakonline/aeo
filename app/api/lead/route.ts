import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { saveLead, getScan } from '@/src/db/repo'
import { notifyLead } from '@/src/mail/notifier'

const Body = z.object({ scanId: z.number(), email: z.string().email() })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const scan = await getScan(parsed.data.scanId)
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })
  await saveLead(parsed.data.scanId, parsed.data.email)
  await notifyLead(parsed.data.email, scan.domain, scan.total)
  return NextResponse.json({ ok: true })
}
