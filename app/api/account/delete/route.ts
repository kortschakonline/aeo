import { NextResponse } from 'next/server'
import { getSession, destroySession } from '@/src/auth/session'
import { deleteAccount } from '@/src/db/repo'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  await deleteAccount(session.accountId, session.email)
  await destroySession()
  return NextResponse.json({ ok: true })
}
