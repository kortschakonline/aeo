import type { CheckResult, ScanContext } from '@/src/engine/types'

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot']

function blocksBot(robots: string, bot: string): boolean {
  const lines = robots.split('\n').map(l => l.trim())
  let active = false
  for (const line of lines) {
    const m = /^user-agent:\s*(.+)$/i.exec(line)
    if (m) { active = m[1].trim().toLowerCase() === bot.toLowerCase() || m[1].trim() === '*'; continue }
    if (active && /^disallow:\s*\/\s*$/i.test(line)) return true
  }
  return false
}

export function auffindbarkeitChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'auffindbarkeit', score, label, detail, fix })

  const robots = ctx.robotsTxt ?? ''
  const blockedBots = AI_BOTS.filter(b => robots && blocksBot(robots, b))
  const noindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(ctx.html)

  return [
    c('llms_txt', ctx.llmsTxt ? 1 : 0, 'llms.txt',
      ctx.llmsTxt ? 'llms.txt vorhanden.' : 'Keine llms.txt gefunden.',
      'Lege eine llms.txt im Root an, die KI-Systemen Struktur & wichtige Inhalte erklärt.'),
    c('robots_txt', ctx.robotsTxt ? 1 : 0, 'robots.txt',
      ctx.robotsTxt ? 'robots.txt vorhanden.' : 'Keine robots.txt gefunden.',
      'Lege eine robots.txt an und referenziere die Sitemap.'),
    c('ai_crawlers', blockedBots.length ? 0 : 1, 'KI-Crawler-Zugriff',
      blockedBots.length ? `Blockiert: ${blockedBots.join(', ')}.` : 'KI-Crawler werden nicht blockiert.',
      'Erlaube GPTBot, ClaudeBot, PerplexityBot & Google-Extended in robots.txt.'),
    c('sitemap', ctx.sitemapXml ? 1 : 0, 'Sitemap',
      ctx.sitemapXml ? 'sitemap.xml vorhanden.' : 'Keine sitemap.xml gefunden.',
      'Erzeuge eine sitemap.xml und verlinke sie in robots.txt.'),
    c('indexable', noindex ? 0 : 1, 'Indexierbarkeit',
      noindex ? 'Seite ist auf noindex gesetzt.' : 'Seite ist indexierbar.',
      'Entferne das noindex-Meta-Tag auf wichtigen Seiten.'),
  ]
}
