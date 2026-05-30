import { chromium } from 'playwright'

export interface RenderOutput { html: string; responseMs: number }

export async function renderPage(url: string): Promise<RenderOutput> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (AEO-Scanner; +https://aeo.kortschak.online)' })
    const start = Date.now()
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 })
    const responseMs = Date.now() - start
    void resp
    const html = await page.content()
    return { html, responseMs }
  } finally {
    await browser.close()
  }
}
