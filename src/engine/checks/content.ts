import type { CheckResult, ScanContext } from '@/src/engine/types'

export function contentChecks(ctx: ScanContext): CheckResult[] {
  const c = (key: string, score: number, label: string, detail: string, fix?: string): CheckResult =>
    ({ key, category: 'content', score, label, detail, fix })
  const h = ctx.html

  const h1Count = (h.match(/<h1[\s>]/gi) ?? []).length
  const h2Count = (h.match(/<h2[\s>]/gi) ?? []).length
  const hasFaq = /"@type"\s*:\s*"FAQPage"/i.test(h) || /itemtype=["'][^"']*FAQPage/i.test(h)
  const listCount = (h.match(/<(ul|ol|table)[\s>]/gi) ?? []).length
  const h1Score = h1Count === 1 ? 1 : h1Count === 0 ? 0 : 0.5

  return [
    c('h1', h1Score, 'H1-Überschrift',
      h1Count === 1 ? 'Genau eine H1.' : h1Count === 0 ? 'Keine H1 gefunden.' : `${h1Count} H1-Tags (sollte 1 sein).`,
      'Verwende genau eine klare H1 pro Seite.'),
    c('headings', h2Count >= 2 ? 1 : h2Count === 1 ? 0.5 : 0, 'Heading-Struktur',
      `${h2Count} H2-Abschnitte.`,
      'Gliedere Inhalte mit mehreren frage-orientierten H2-Überschriften.'),
    c('faq', hasFaq ? 1 : 0, 'FAQ / Q&A',
      hasFaq ? 'FAQ-Markup gefunden.' : 'Kein FAQ-Markup.',
      'Ergänze einen FAQ-Abschnitt mit FAQPage-Schema — ideal für KI-Antworten.'),
    c('lists', listCount >= 1 ? 1 : 0, 'Listen & Tabellen',
      `${listCount} Listen/Tabellen.`,
      'Nutze Listen/Tabellen — KI zitiert strukturierte Inhalte leichter.'),
  ]
}
