type FetchFn = (url: string) => Promise<Response>

async function get(url: string, fetchFn: FetchFn): Promise<string | null> {
  try {
    const res = await fetchFn(url)
    if (!res.ok) return null
    return await res.text()
  } catch { return null }
}

export async function fetchAuxFiles(url: string, fetchFn: FetchFn = fetch) {
  const origin = new URL(url).origin
  const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    get(`${origin}/robots.txt`, fetchFn),
    get(`${origin}/sitemap.xml`, fetchFn),
    get(`${origin}/llms.txt`, fetchFn),
  ])
  return { robotsTxt, sitemapXml, llmsTxt }
}
