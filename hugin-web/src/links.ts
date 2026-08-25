/** Every company always offers a working link: the verified website when present, else a
 * Google search fallback (contract in docs/specs/2026-08-20-hugin-v3-pivot.md, decision 6 —
 * amended v3.2: Proff dropped from the fallback, Proff.no lives on only as a seeded header
 * source). No crawling — just a query string built client-side. */

export function googleSearchUrl(name: string, kommuneNavn: string | null): string {
  const query = `"${name}" ${kommuneNavn ?? ''}`.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

/** Header sources row shows short names, not the long linkout labels from config
 * (spec v3.1 item 7). Unknown domains keep their configured label. */
export function sourceLabel(url: string, fallback: string): string {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return fallback
  }
  if (host === 'finn.no' || host.endsWith('.finn.no')) return 'FINN'
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn'
  return fallback
}
