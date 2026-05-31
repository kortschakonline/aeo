type Entry = { count: number; resetAt: number }

export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? (() => Date.now())
  const hits = new Map<string, Entry>()
  return {
    allow(key: string): boolean {
      const t = now()
      const e = hits.get(key)
      if (!e || t >= e.resetAt) {
        hits.set(key, { count: 1, resetAt: t + opts.windowMs })
        return true
      }
      if (e.count >= opts.max) return false
      e.count++
      return true
    },
  }
}

// Gemeinsamer Limiter für Login-Anfragen: 5 pro 10 Minuten je Schlüssel.
// Hinweis: In-Memory, pro Prozess — ausreichend für den Single-Container-Deploy.
export const loginRateLimiter = createRateLimiter({ max: 5, windowMs: 10 * 60 * 1000 })
