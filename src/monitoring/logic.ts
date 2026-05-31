import { MONITOR_INTERVAL_DAYS } from '@/src/monitoring/constants'

export type MonitorDueInput = { active: boolean; lastRunAt: Date | null }

export function isDue(monitor: MonitorDueInput, now: Date = new Date()): boolean {
  if (!monitor.active) return false
  if (monitor.lastRunAt == null) return true
  const threshold = now.getTime() - MONITOR_INTERVAL_DAYS * 24 * 60 * 60 * 1000
  return monitor.lastRunAt.getTime() < threshold
}

export function scoreChange(
  oldScore: number | null,
  newScore: number,
): { changed: boolean; direction: 'up' | 'down' | 'none' } {
  if (oldScore == null || newScore === oldScore) return { changed: false, direction: 'none' }
  return { changed: true, direction: newScore > oldScore ? 'up' : 'down' }
}

export function canEnable(activeCount: number, max: number, alreadyActive: boolean): boolean {
  return alreadyActive || activeCount < max
}
