import { normalizeUrl, domainOf } from '@/src/engine/url'
import { renderPage, type RenderOutput } from '@/src/engine/render'
import { fetchAuxFiles } from '@/src/engine/fetchers'
import { technikChecks } from '@/src/engine/checks/technik'
import { auffindbarkeitChecks } from '@/src/engine/checks/auffindbarkeit'
import { contentChecks } from '@/src/engine/checks/content'
import { scoreScan } from '@/src/engine/scoring'
import { extractText } from '@/src/engine/text'
import type { ScanContext, ScanResult } from '@/src/engine/types'

export interface ScanDeps {
  render?: (url: string) => Promise<RenderOutput>
  fetchAux?: (url: string) => Promise<{ robotsTxt: string|null; sitemapXml: string|null; llmsTxt: string|null }>
}

export async function runScan(input: string, deps: ScanDeps = {}): Promise<ScanResult> {
  const render = deps.render ?? renderPage
  const fetchAux = deps.fetchAux ?? fetchAuxFiles
  const url = normalizeUrl(input)
  const domain = domainOf(url)

  const [{ html, responseMs }, aux] = await Promise.all([render(url), fetchAux(url)])
  const ctx: ScanContext = { url, domain, html, responseMs, ...aux }

  const checks = [...technikChecks(ctx), ...auffindbarkeitChecks(ctx), ...contentChecks(ctx)]
  const result = scoreScan(url, domain, checks)
  return { ...result, contentExcerpt: extractText(html) }
}
