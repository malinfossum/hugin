/** Every company always offers a working link: the verified website when present, else a
 * Google and Proff.no search fallback (contract in docs/specs/2026-08-20-hugin-v3-pivot.md,
 * decision 6). No crawling — just query strings built client-side. */

export function googleSearchUrl(name: string, kommuneNavn: string | null): string {
  const query = `"${name}" ${kommuneNavn ?? ''}`.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function proffSearchUrl(name: string): string {
  return `https://www.proff.no/search?q=${encodeURIComponent(name)}`
}
