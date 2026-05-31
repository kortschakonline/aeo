export type Plan = 'free' | 'klein' | 'gross'

export const PLAN_LIMITS: Record<Plan, { monitors: number; autoBrand: boolean; export: boolean }> = {
  free: { monitors: 0, autoBrand: false, export: false },
  klein: { monitors: 1, autoBrand: false, export: false },
  gross: { monitors: 10, autoBrand: true, export: true },
}

const ACTIVE_STATUSES = ['active', 'trialing']

export function effectivePlan(sub: { plan: Plan; status: string } | null): Plan {
  if (!sub) return 'free'
  return ACTIVE_STATUSES.includes(sub.status) ? sub.plan : 'free'
}

export function monitorLimit(plan: Plan): number {
  return PLAN_LIMITS[plan].monitors
}

export function monitorsToDeactivate(
  monitors: { id: number; createdAt: Date }[],
  limit: number,
): number[] {
  const sorted = [...monitors].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return sorted.slice(limit).map((m) => m.id)
}

export function resolvePlan(sub: { plan: Plan; status: string } | null, isComp: boolean): Plan {
  if (isComp) return 'gross'
  return effectivePlan(sub)
}
