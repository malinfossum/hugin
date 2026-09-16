import { fylkeOf } from './fylker'

/** One fylke in the render lens, optionally narrowed to kommuner in it. Several regions make a
 * Visningsfilter (v3.6). Kommune numbers embed the fylke as their first two digits. */
export interface Region {
  /** Two-digit fylkesnummer, a key in FYLKER. */
  fylke: string
  /** Four-digit kommunenummer in that fylke. Empty = the whole fylke. */
  kommuner: string[]
}

/** Canonical order: regions by fylke number, kommuner by number, deduped — so two equal
 * filters are equal as JSON and chips never reorder because of tick order. Numbers are
 * fixed-width digit strings, so plain string sort is numeric sort. */
export function normalizeRegions(regions: Region[]): Region[] {
  return [...regions]
    .sort((a, b) => a.fylke.localeCompare(b.fylke))
    .map((r) => ({ fylke: r.fylke, kommuner: [...new Set(r.kommuner)].sort() }))
}

export function regionFor(regions: Region[], fylke: string): Region | undefined {
  return regions.find((r) => r.fylke === fylke)
}

/** The region half of the lens. Empty regions = all of Norway; a missing kommune fails open,
 * as every focus rule does on missing data. */
export function regionMatches(kommune: string | null, regions: Region[]): boolean {
  if (regions.length === 0 || kommune === null) return true
  const fylke = fylkeOf(kommune)
  return regions.some(
    (r) => r.fylke === fylke && (r.kommuner.length === 0 || r.kommuner.includes(kommune))
  )
}

/** Tick a fylke: the whole fylke, clearing any kommuner ticked under it (the tick means all). */
export function tickFylke(regions: Region[], fylke: string): Region[] {
  return normalizeRegions([...regions.filter((r) => r.fylke !== fylke), { fylke, kommuner: [] }])
}

/** Untick a fylke: the region goes, its kommuner with it. */
export function untickFylke(regions: Region[], fylke: string): Region[] {
  return regions.filter((r) => r.fylke !== fylke)
}

/** Tick a kommune: creates a narrowed region for its fylke, adds to one, or narrows a whole
 * fylke down to this kommune. */
export function tickKommune(regions: Region[], kommune: string): Region[] {
  const fylke = fylkeOf(kommune)
  if (!fylke) return regions
  const existing = regionFor(regions, fylke)
  return normalizeRegions([
    ...regions.filter((r) => r.fylke !== fylke),
    { fylke, kommuner: [...(existing?.kommuner ?? []), kommune] },
  ])
}

/** Untick a kommune. Unticking the last one leaves the WHOLE fylke — dropping the region here
 * would make "all of Innlandet" unreachable by unticking, and unticking must never widen. The
 * fylke tick box is how a fylke is removed. */
export function untickKommune(regions: Region[], kommune: string): Region[] {
  const fylke = fylkeOf(kommune)
  const existing = fylke ? regionFor(regions, fylke) : undefined
  if (!fylke || !existing) return regions
  return normalizeRegions([
    ...regions.filter((r) => r.fylke !== fylke),
    { fylke, kommuner: existing.kommuner.filter((k) => k !== kommune) },
  ])
}
