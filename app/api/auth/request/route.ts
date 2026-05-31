import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateToken, loginTokenExpiry } from '@/src/auth/tokens'
import { createLoginToken } from '@/src/db/repo'
import { sendMagicLink } from '@/src/mail/notifier'
import { loginRateLimiter } from '@/src/auth/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 30

const Body = z.object({ email: z.string().email() })

function baseUrl(req: NextRequest): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'aeo.kortschak.online'
  return `${proto}://${host}`
}

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige E-Mail' }, { status: 400 })

  const email = parsed.data.email.toLowerCase()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  // Rate-Limit, antwortet aber weiterhin generisch (keine Enumeration).
  if (loginRateLimiter.allow(`${email}|${ip}`)) {
    const { token, tokenHash } = generateToken()
    await createLoginToken(email, tokenHash, loginTokenExpiry())
    const link = `${baseUrl(req)}/api/auth/callback?token=${token}`
    try {
      await sendMagicLink(email, link)
    } catch (e) {
      console.error('Magic-Link-Mail fehlgeschlagen:', e)
    }
  }

  // Immer gleiche Antwort — keine Account-Enumeration.
  return NextResponse.json({ ok: true })
}
