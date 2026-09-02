import type { Focus } from './focus'
import { fylkeOf } from './fylker'
import type { DiscoveryConfigDto, DiscoveryWriteRequest, KommuneDto } from './types'

/** What the coverage cascade edits: one fylke ('' = all of Norway) and the kommuner checked
 * under it (none = the whole fylke). This is the SERVER scope — what sync fetches — as opposed
 * to Focus, the render-side lens. */
export interface CoverageDraft {
  fylke: string
  kommuner: string[]
}

export function toDiscoveryRequest(draft: CoverageDraft): DiscoveryWriteRequest {
  if (!draft.fylke) return { municipalityNumbers: [], fylker: [], allOfNorway: true }
  if (draft.kommuner.length === 0)
    return { municipalityNumbers: [], fylker: [draft.fylke], allOfNorway: false }
  return { municipalityNumbers: draft.kommuner, fylker: [], allOfNorway: false }
}

/** The cascade shows one fylke at a time: a config listing kommuner across several fylker shows
 * the first one's; the others are left untouched only until the next save (accepted — the
 * default config and every UI-written config are single-fylke). */
export function fromDiscoveryConfig(config: DiscoveryConfigDto): CoverageDraft {
  if (config.allOfNorway) return { fylke: '', kommuner: [] }
  if (config.fylker.length > 0) return { fylke: config.fylker[0], kommuner: [] }
  const first = config.municipalities[0]
  const fylke = first ? (fylkeOf(first.number) ?? '') : ''
  if (!fylke) return { fylke: '', kommuner: [] }
  return {
    fylke,
    kommuner: config.municipalities.map((m) => m.number).filter((n) => n.startsWith(fylke)),
  }
}

/** Seeds the render lens from the chosen scope: Focus holds at most one kommune, so only a
 * single checked kommune narrows it; several checked keep the lens at the fylke. */
export function toFocusSeed(draft: CoverageDraft, categories: string[]): Focus {
  return {
    fylke: draft.fylke || null,
    kommune: draft.kommuner.length === 1 ? draft.kommuner[0] : null,
    categories,
  }
}

export function kommunerInFylke(all: KommuneDto[], fylke: string): KommuneDto[] {
  if (!fylke) return []
  return all
    .filter((k) => k.number.startsWith(fylke))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}
