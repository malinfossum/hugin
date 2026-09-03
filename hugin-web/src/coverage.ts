import type { Focus } from './focus'
import { fylkeOf } from './fylker'
import type {
  DiscoveryConfigDto,
  DiscoveryWriteRequest,
  KommuneDto,
  MunicipalityRefDto,
} from './types'

/** Coverage the cascade does not render: kommuner and whole fylker outside the rendered fylke.
 * Listed under the cascade with a remove button each, and merged back into every save, so a
 * multi-fylke config survives the UI instead of being silently narrowed to one fylke. */
export interface CoverageOthers {
  municipalities: MunicipalityRefDto[]
  fylker: string[]
}

/** What the coverage cascade edits: one rendered fylke ('' = all of Norway), the kommuner
 * checked under it (none = the whole fylke), plus everything outside it. This is the SERVER
 * scope — what sync fetches — as opposed to Focus, the render-side lens. */
export interface CoverageDraft {
  fylke: string
  kommuner: string[]
  others: CoverageOthers
}

export const NO_OTHERS: CoverageOthers = { municipalities: [], fylker: [] }

export function toDiscoveryRequest(draft: CoverageDraft): DiscoveryWriteRequest {
  if (!draft.fylke) return { municipalityNumbers: [], fylker: [], allOfNorway: true }
  const own = draft.kommuner.length === 0 ? [draft.fylke] : []
  return {
    municipalityNumbers: [...draft.kommuner, ...draft.others.municipalities.map((m) => m.number)],
    fylker: [...own, ...draft.others.fylker],
    allOfNorway: false,
  }
}

/** What to actually save, given what the cascade could render. With no kommune list
 * (`kommuner === null`) the checkboxes are not drawn at all, so any prefilled numbers are
 * invisible and un-clearable — and the API refuses numbers it cannot verify against the
 * register. Degrade to the fylke alone: that is what the user sees, so that is what is saved.
 * The others stay: they are listed by name, so nothing invisible is dropped. */
export function effectiveDraft(draft: CoverageDraft, kommuner: KommuneDto[] | null): CoverageDraft {
  return kommuner === null ? { ...draft, kommuner: [] } : draft
}

/** The cascade renders one fylke at a time — the first whole fylke, else the fylke of the first
 * kommune — and everything else lands in `others`. */
export function fromDiscoveryConfig(config: DiscoveryConfigDto): CoverageDraft {
  if (config.allOfNorway) return { fylke: '', kommuner: [], others: NO_OTHERS }
  const fylke = config.fylker[0] ?? fylkeOf(config.municipalities[0]?.number) ?? ''
  if (!fylke) return { fylke: '', kommuner: [], others: NO_OTHERS }
  return {
    fylke,
    kommuner: config.municipalities.filter((m) => inFylke(m.number, fylke)).map((m) => m.number),
    others: {
      municipalities: config.municipalities.filter((m) => !inFylke(m.number, fylke)),
      fylker: config.fylker.filter((f) => f !== fylke),
    },
  }
}

/** Changes which fylke the cascade renders without losing anything: the current selection
 * (checked kommuner, or the whole fylke when none are) moves out to `others`, and whatever
 * `others` already held for the next fylke moves in. All of Norway has nothing to move either
 * way. Moved kommuner are named from the register list, falling back to the number. */
export function switchFylke(
  draft: CoverageDraft,
  nextFylke: string,
  known: KommuneDto[] | null
): CoverageDraft {
  if (nextFylke === draft.fylke) return draft
  let others = draft.others
  if (draft.fylke) {
    const moved = draft.kommuner.map((number) => ({
      name: known?.find((k) => k.number === number)?.name ?? number,
      number,
    }))
    others = {
      municipalities: [...others.municipalities, ...moved],
      fylker: draft.kommuner.length === 0 ? [...others.fylker, draft.fylke] : others.fylker,
    }
  }
  if (!nextFylke) return { fylke: '', kommuner: [], others }
  return {
    fylke: nextFylke,
    kommuner: others.municipalities
      .filter((m) => inFylke(m.number, nextFylke))
      .map((m) => m.number),
    others: {
      municipalities: others.municipalities.filter((m) => !inFylke(m.number, nextFylke)),
      fylker: others.fylker.filter((f) => f !== nextFylke),
    },
  }
}

export function removeOtherKommune(draft: CoverageDraft, number: string): CoverageDraft {
  return {
    ...draft,
    others: {
      ...draft.others,
      municipalities: draft.others.municipalities.filter((m) => m.number !== number),
    },
  }
}

export function removeOtherFylke(draft: CoverageDraft, fylke: string): CoverageDraft {
  return {
    ...draft,
    others: { ...draft.others, fylker: draft.others.fylker.filter((f) => f !== fylke) },
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
    .filter((k) => inFylke(k.number, fylke))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
}

function inFylke(kommunenummer: string, fylke: string): boolean {
  return kommunenummer.startsWith(fylke)
}
