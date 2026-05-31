type AccessEnv = { ADMIN_EMAILS?: string; COMP_EMAILS?: string }

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string, env: AccessEnv = process.env as AccessEnv): boolean {
  return parseList(env.ADMIN_EMAILS).includes(email.toLowerCase())
}

export function isCompEmail(email: string, env: AccessEnv = process.env as AccessEnv): boolean {
  return isAdminEmail(email, env) || parseList(env.COMP_EMAILS).includes(email.toLowerCase())
}
