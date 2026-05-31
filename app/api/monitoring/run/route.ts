import { NextRequest, NextResponse } from 'next/server'
import { getActiveMonitorsWithEmail, recordMonitorRun, saveScan } from '@/src/db/repo'
import { runScan } from '@/src/engine/scan'
import { isDue, scoreChange } from '@/src/monitoring/logic'
import { MONITOR_RUN_CAP } from '@/src/monitoring/constants'
import { sendMonitoringAlert } from '@/src/mail/notifier'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = process.env.MONITORING_SECRET
  if (!secret) return NextResponse.json({ error: 'Monitoring nicht konfiguriert' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  }

  const now = new Date()
  const active = await getActiveMonitorsWithEmail()
  const due = active.filter((m) => isDue({ active: true, lastRunAt: m.lastRunAt }, now))
  const batch = due.slice(0, MONITOR_RUN_CAP)

  let alerted = 0
  let errors = 0
  for (const m of batch) {
    try {
      const result = await runScan(m.url)
      await saveScan(result, m.accountId)
      const change = scoreChange(m.lastScore, result.total)
      if (change.changed) {
        await sendMonitoringAlert(m.email, m.domain, m.lastScore as number, result.total)
        alerted++
      }
      await recordMonitorRun(m.id, result.total)
    } catch (e) {
      errors++
      console.error(`Monitoring-Scan fehlgeschlagen für ${m.domain}:`, e)
    }
  }

  return NextResponse.json({ checked: batch.length, alerted, errors, capped: due.length > MONITOR_RUN_CAP })
}
