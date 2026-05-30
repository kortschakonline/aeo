import { NextRequest, NextResponse } from 'next/server'
import { getScan } from '@/src/db/repo'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await getScan(Number(id))
  if (!row) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 })
  return NextResponse.json(row)
}
