import { NextRequest, NextResponse } from 'next/server'
import { getScan } from '@/src/db/repo'
import { getSession } from '@/src/auth/session'
import { canAccessScan } from '@/src/auth/scanAccess'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getScan(Number(id))
  if (!row) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 })
  const session = await getSession()
  // Bei fehlender Berechtigung 404 (statt 403), um die Existenz fremder Scans nicht zu verraten.
  if (!canAccessScan(row, session)) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 })
  return NextResponse.json(row)
}
