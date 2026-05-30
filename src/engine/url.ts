export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const u = new URL(withScheme) // wirft bei ungültiger URL
  if (!/\./.test(u.hostname)) throw new Error('invalid hostname')
  u.hash = ''
  return u.toString()
}

export function domainOf(url: string): string {
  return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
}
