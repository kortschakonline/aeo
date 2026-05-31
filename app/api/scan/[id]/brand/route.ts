import { NextRequest, NextResponse } from 'next/server'
import { getScan, saveBrandVisibility } from '@/src/db/repo'
import { runBrandVisibility } from '@/src/ai/brand'
import type { BrandVisibility } from '@/src/ai/types'
import { getSession } from '@/src/auth/session'
import { canAccessScan } from '@/src/auth/scanAccess'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = await getScan(Number(id))
  if (!scan) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })

  const session = await getSession()
  // Bei fehlender Berechtigung 404 (statt 403), um die Existenz fremder Scans nicht zu verraten.
  if (!canAccessScan(scan, session)) return NextResponse.json({ error: 'Scan nicht gefunden' }, { status: 404 })

  const cached = (scan.brandVisibility as BrandVisibility | null) ?? null
  if (cached) return NextResponse.json({ brandVisibility: cached, error: false })

  try {
    const data = await runBrandVisibility(scan.contentExcerpt ?? '', scan.domain)
    await saveBrandVisibility(Number(id), data)
    return NextResponse.json({ brandVisibility: data, error: false })
  } catch (e) {
    console.error('Brand-Visibility fehlgeschlagen:', e)
    return NextResponse.json({ brandVisibility: null, error: true })
  }
}
