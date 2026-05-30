import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { runScan } from '@/src/engine/scan'
import { saveScan } from '@/src/db/repo'

export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({ url: z.string().min(3) })

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige URL' }, { status: 400 })
  try {
    const result = await runScan(parsed.data.url)
    const id = await saveScan(result)
    return NextResponse.json({ id, result })
  } catch (e) {
    return NextResponse.json({ error: 'Scan fehlgeschlagen', detail: String(e) }, { status: 500 })
  }
}
