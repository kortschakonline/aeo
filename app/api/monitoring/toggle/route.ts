import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/src/auth/session'
import { getMonitorsForAccount, latestScanUrlForDomain, upsertMonitor } from '@/src/db/repo'
import { canEnable } from '@/src/monitoring/logic'
import { MAX_MONITORS } from '@/src/monitoring/constants'

export const runtime = 'nodejs'

const Body = z.object({ domain: z.string().min(1), active: z.boolean() })

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
  const { domain, active } = parsed.data

  const list = await getMonitorsForAccount(session.accountId)
  const existing = list.find((m) => m.domain === domain)

  if (active) {
    const alreadyActive = !!existing?.active
    const activeCount = list.filter((m) => m.active).length
    if (!canEnable(activeCount, MAX_MONITORS, alreadyActive)) {
      return NextResponse.json({ error: `Limit erreicht (max. ${MAX_MONITORS})` }, { status: 409 })
    }
  }

  // URL: bestehenden Monitor wiederverwenden; sonst (Erstaktivierung) die neueste Scan-URL.
  const url = existing?.url ?? (await latestScanUrlForDomain(session.accountId, domain))
  if (!url) return NextResponse.json({ error: 'Keine Scan-URL für diese Domain' }, { status: 400 })

  await upsertMonitor(session.accountId, domain, url, active)
  return NextResponse.json({ ok: true, active })
}
