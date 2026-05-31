/**
 * Zugriffsregel für einzelne Scans (Stufe 4a).
 *
 * - Account-Scans (account_id gesetzt) sind ausschließlich für den Eigentümer
 *   sichtbar (Session-accountId muss übereinstimmen).
 * - Anonyme Scans (account_id IS NULL) sind nur innerhalb eines kurzen Fensters
 *   nach der Erstellung abrufbar. Das hält den anonymen Funnel (Scan → Unlock →
 *   Brand) funktionsfähig, begrenzt aber das Durchprobieren fortlaufender IDs
 *   auf frisch erstellte Scans.
 */

/** Zeitfenster, in dem ein anonymer Scan ohne Session abrufbar bleibt. */
export const ANON_SCAN_TTL_MS = 30 * 60 * 1000 // 30 Minuten

export function canAccessScan(
  scan: { accountId: number | null; createdAt: Date },
  session: { accountId: number } | null,
  opts: { now?: number; ttlMs?: number } = {},
): boolean {
  if (scan.accountId != null) {
    return session?.accountId === scan.accountId
  }
  const now = opts.now ?? Date.now()
  const ttlMs = opts.ttlMs ?? ANON_SCAN_TTL_MS
  return now - scan.createdAt.getTime() <= ttlMs
}
