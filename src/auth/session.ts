import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/src/db/client'
import { sessions, accounts } from '@/src/db/schema'
import { ensureSchema } from '@/src/db/migrate'
import { generateToken, hashToken, sessionExpiry, isExpired } from '@/src/auth/tokens'

export const SESSION_COOKIE = 'aeo_session'

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }

/** Nur aus Route Handlern / Server Functions aufrufen (schreibt ein Cookie). */
export async function createSession(accountId: number): Promise<void> {
  await ensureSchema()
  const { token, tokenHash } = generateToken()
  const expiresAt = sessionExpiry()
  await db.insert(sessions).values({ accountId, tokenHash, expiresAt, lastSeenAt: new Date() })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, { ...COOKIE_OPTS, expires: expiresAt })
}

/** Liest die aktuelle Session. Sicher in Server Components (schreibt kein Cookie). */
export async function getSession(): Promise<{ accountId: number; email: string } | null> {
  await ensureSchema()
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const [row] = await db.select({
    id: sessions.id, accountId: sessions.accountId, expiresAt: sessions.expiresAt, email: accounts.email,
  }).from(sessions).innerJoin(accounts, eq(sessions.accountId, accounts.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
  if (!row) return null
  if (isExpired(row.expiresAt)) {
    await db.delete(sessions).where(eq(sessions.id, row.id))
    return null
  }
  return { accountId: row.accountId, email: row.email }
}

/** Nur aus Route Handlern / Server Functions aufrufen (löscht Cookie). */
export async function destroySession(): Promise<void> {
  await ensureSchema()
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  store.set(SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 })
}
