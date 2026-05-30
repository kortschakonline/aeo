export type Category = 'technik' | 'auffindbarkeit' | 'content' | 'ki_sichtbarkeit'

export interface CheckResult {
  key: string
  category: Category
  score: number        // 0..1
  label: string        // menschenlesbar, z.B. "Schema.org JSON-LD"
  detail: string       // Befund-Text
  fix?: string         // Empfehlung (im Gate)
}

export interface ScanContext {
  url: string
  domain: string
  html: string             // gerendertes DOM-HTML
  robotsTxt: string | null
  sitemapXml: string | null
  llmsTxt: string | null
  responseMs: number
}

export interface CategoryScore { category: Category; score: number } // 0..100

export interface ScanResult {
  url: string
  domain: string
  total: number                 // 0..100
  categories: CategoryScore[]
  checks: CheckResult[]
  contentExcerpt?: string
}
