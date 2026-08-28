/** 2024 fylke set. Static by design: kommune numbers embed the fylke as their first two
 * digits, and this list changes only by national reform. Unknown prefixes fail open
 * under the raw number (fylkeName fallback). */
export const FYLKER: ReadonlyMap<string, string> = new Map([
  ['03', 'Oslo'], ['11', 'Rogaland'], ['15', 'Møre og Romsdal'], ['18', 'Nordland'],
  ['31', 'Østfold'], ['32', 'Akershus'], ['33', 'Buskerud'], ['34', 'Innlandet'],
  ['39', 'Vestfold'], ['40', 'Telemark'], ['42', 'Agder'], ['46', 'Vestland'],
  ['50', 'Trøndelag'], ['55', 'Troms'], ['56', 'Finnmark'],
])

export function fylkeOf(kommunenummer: string | null | undefined): string | null {
  if (!kommunenummer || kommunenummer.length < 2) return null
  return kommunenummer.slice(0, 2)
}

export function fylkeName(nr: string): string {
  return FYLKER.get(nr) ?? nr
}
