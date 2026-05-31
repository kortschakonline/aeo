import { redirect } from 'next/navigation'
import { getSession } from '@/src/auth/session'
import { isAdminEmail } from '@/src/billing/access'

/** Server-seitig: liefert die Admin-Session oder redirectet zu /login. */
export async function requireAdmin(): Promise<{ accountId: number; email: string }> {
  const session = await getSession()
  if (!session || !isAdminEmail(session.email)) redirect('/login')
  return session
}
