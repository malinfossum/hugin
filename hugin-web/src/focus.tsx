import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react'
import { FYLKER } from './fylker'
import { normalizeRegions, type Region, regionMatches } from './regions'

/** The render lens (spec v3.6 A1): several regions, each a fylke whole or narrowed to kommuner,
 * plus NAV categories. Per-browser, in localStorage; the server never sees it. */
export interface Focus {
  /** Empty = all of Norway. */
  regions: Region[]
  categories: string[]
}

/** NAV level-2 categories Hugin's sync gates ads to. ad.category strings look like
 * "IT / Utvikling; IT / Drift, vedlikehold" — matching against these is String.includes. */
export const KNOWN_CATEGORIES: readonly string[] = ['Utvikling', 'Drift, vedlikehold']

const STORAGE_KEY = 'hugin-focus'
const KOMMUNE_NUMBER = /^\d{4}$/

function readCategories(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((c) => typeof c === 'string')
    ? (value as string[])
    : null
}

/** v2 region check (spec A2): an array of { fylke in FYLKER, kommuner: four digits starting
 * with that fylke }, no fylke twice. Kommuner are not checked against the register. */
function readRegions(value: unknown): Region[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const regions: Region[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const { fylke, kommuner } = item as Record<string, unknown>
    if (typeof fylke !== 'string' || !FYLKER.has(fylke) || seen.has(fylke)) return null
    if (
      !Array.isArray(kommuner) ||
      !kommuner.every((k) => typeof k === 'string' && KOMMUNE_NUMBER.test(k) && k.startsWith(fylke))
    ) {
      return null
    }
    seen.add(fylke)
    regions.push({ fylke, kommuner: kommuner as string[] })
  }
  return regions
}

/** v1 → v2 (spec A3). The v1 checks are the ones v3.3–v3.5 applied; the converted regions then
 * pass the v2 check too, so a v1 fylke outside FYLKER is rejected rather than migrated. */
function migrateV1(p: Record<string, unknown>): Focus | null {
  const fylke =
    p.fylke === null || typeof p.fylke === 'string' ? (p.fylke as string | null) : undefined
  const kommune =
    p.kommune === null || typeof p.kommune === 'string' ? (p.kommune as string | null) : undefined
  const categories = readCategories(p.categories)
  if (fylke === undefined || kommune === undefined || categories === null) return null
  if (kommune && (!fylke || !kommune.startsWith(fylke))) return null
  const regions = readRegions(fylke ? [{ fylke, kommuner: kommune ? [kommune] : [] }] : [])
  return regions ? { regions, categories } : null
}

function normalizeFocus(focus: Focus): Focus {
  return { regions: normalizeRegions(focus.regions), categories: focus.categories }
}

/** Validated read of the persisted focus preference. Returns null for: missing key, unreadable
 * storage, invalid JSON, a schema version other than 1 or 2, or malformed fields. A v1 record is
 * migrated and written back as v2 (best-effort). null means "unanswered" — never treat it as an
 * empty focus. */
export function loadFocus(): Focus | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const p = parsed as Record<string, unknown>
  if (p.v === 1) {
    const migrated = migrateV1(p)
    if (migrated) saveFocus(migrated)
    return migrated && normalizeFocus(migrated)
  }
  if (p.v !== 2) return null

  const regions = readRegions(p.regions)
  const categories = readCategories(p.categories)
  if (!regions || !categories) return null
  return normalizeFocus({ regions, categories })
}

export function saveFocus(focus: Focus): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, ...normalizeFocus(focus) }))
  } catch {
    /* localStorage unavailable (private mode etc.) — choice just won't persist */
  }
}

export function clearFocus(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}

/** Tracked ads bypass focus entirely (hard spec rule — a pipeline deadline must never be hidden
 * by a filter). Otherwise region and category each fail open on missing data. */
export function adMatchesFocus(
  ad: { kommune: string | null; category: string | null; pipelineStatus: string | null },
  focus: Focus | null
): boolean {
  if (!focus) return true
  if (ad.pipelineStatus) return true

  const regionOk = regionMatches(ad.kommune, focus.regions)

  const category = ad.category
  const categoryOk =
    focus.categories.length === 0 || !category
      ? true
      : focus.categories.some((c) => category.includes(c))

  return regionOk && categoryOk
}

interface FocusContextValue {
  focus: Focus | null
  /** `persist: false` keeps the lens for this session only — the first-run dialog uses it on
   * a failed scope save, so the dialog comes back on the next launch. */
  setFocus: (focus: Focus, options?: { persist?: boolean }) => void
  resetFocus: () => void
}

// Default (no Provider in the tree) mirrors LanguageContext's convention in i18n/index.ts: a
// working, non-throwing fallback rather than an error. The real app always wraps the tree in
// FocusProvider.
const FocusContext = createContext<FocusContextValue>({
  focus: null,
  setFocus: () => {},
  resetFocus: () => {},
})

export function FocusProvider({ children }: { children: ReactNode }): ReactElement {
  const [focus, setFocusState] = useState<Focus | null>(loadFocus)

  const setFocus = useCallback((next: Focus, options?: { persist?: boolean }) => {
    const normalized = normalizeFocus(next)
    if (options?.persist !== false) saveFocus(normalized)
    setFocusState(normalized)
  }, [])

  const resetFocus = useCallback(() => {
    clearFocus()
    setFocusState(null)
  }, [])

  return (
    <FocusContext.Provider value={{ focus, setFocus, resetFocus }}>
      {children}
    </FocusContext.Provider>
  )
}

export function useFocus(): FocusContextValue {
  return useContext(FocusContext)
}
