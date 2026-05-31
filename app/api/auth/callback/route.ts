import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { hashToken } from '@/src/auth/tokens'
import { consumeLoginToken, findOrCreateAccount, backfillScans } from '@/src/db/repo'
import { createSession } from '@/src/auth/session'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) redirect('/login?error=invalid')

  const email = await consumeLoginToken(hashToken(token))
  if (!email) redirect('/login?error=expired')

  const accountId = await findOrCreateAccount(email)
  await backfillScans(accountId, email)
  await createSession(accountId)

  redirect('/dashboard')
}
