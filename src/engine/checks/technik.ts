import type { CheckResult, ScanContext } from '@/src/engine/types'

export function technikChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'technik', score, label, detail, fix })
  const h = ctx.html

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(h)
  const title = titleMatch?.[1]?.trim() ?? ''
  const descMatch = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(h)
  const desc = descMatch?.[1]?.trim() ?? ''
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(h)
  const hasOg = /<meta[^>]+property=["']og:title["']/i.test(h)
  const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(h)
  const hasLang = /<html[^>]+lang=/i.test(h)
  const perf = ctx.responseMs <= 800 ? 1 : ctx.responseMs >= 4000 ? 0.2 : 1 - (ctx.responseMs - 800) / 4000

  return [
    c('title', title.length >= 10 ? 1 : title ? 0.5 : 0, 'Seitentitel',
      title ? `Title: "${title}".` : 'Kein <title> gefunden.',
      'Setze einen aussagekräftigen Title (30–60 Zeichen).'),
    c('description', desc.length >= 50 ? 1 : desc ? 0.5 : 0, 'Meta-Description',
      desc ? 'Description vorhanden.' : 'Keine Meta-Description.',
      'Ergänze eine Description mit 120–160 Zeichen.'),
    c('schema', hasJsonLd ? 1 : 0, 'Schema.org (JSON-LD)',
      hasJsonLd ? 'Strukturierte Daten gefunden.' : 'Keine JSON-LD strukturierten Daten.',
      'Füge JSON-LD hinzu (Organization, Article, FAQ, Product …).'),
    c('opengraph', hasOg ? 1 : 0, 'OpenGraph',
      hasOg ? 'OG-Tags vorhanden.' : 'Keine OpenGraph-Tags.',
      'Ergänze og:title, og:description, og:image.'),
    c('canonical', hasCanonical ? 1 : 0, 'Canonical',
      hasCanonical ? 'Canonical-Tag vorhanden.' : 'Kein Canonical-Tag.',
      'Setze ein rel=canonical pro Seite.'),
    c('lang', hasLang ? 1 : 0, 'Sprach-Auszeichnung',
      hasLang ? 'lang-Attribut gesetzt.' : 'Kein lang-Attribut am <html>.',
      'Setze <html lang="de">.'),
    c('performance', Number(perf.toFixed(2)), 'Antwortzeit',
      `Server-Antwort in ${ctx.responseMs} ms.`,
      'Optimiere Ladezeit (Caching, Bildgrößen, weniger Render-Blocking).'),
  ]
}
