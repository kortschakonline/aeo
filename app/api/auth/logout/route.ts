import { NextResponse } from 'next/server'
import { destroySession } from '@/src/auth/session'

export const runtime = 'nodejs'

export async function POST() {
  await destroySession()
  return NextResponse.json({ ok: true })
}
