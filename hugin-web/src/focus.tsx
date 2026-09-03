import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react'

export interface Focus {
  fylke: string | null
  kommune: string | null
  categories: string[]
}

/** NAV level-2 categories Hugin's sync gates ads to. ad.category strings look like
 * "IT / Utvikling; IT / Drift, vedlikehold" — matching against these is String.includes. */
export const KNOWN_CATEGORIES: readonly string[] = ['Utvikling', 'Drift, vedlikehold']

const STORAGE_KEY = 'hugin-focus'

/** Validated read of the persisted focus preference. Returns null for: missing key, unreadable
 * storage, invalid JSON, wrong schema version, malformed fields, or a kommune that doesn't
 * belong to the stored fylke. null means "unanswered" — never treat it as an empty focus. */
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
  if (p.v !== 1) return null

  const fylke =
    p.fylke === null || typeof p.fylke === 'string' ? (p.fylke as string | null) : undefined
  const kommune =
    p.kommune === null || typeof p.kommune === 'string' ? (p.kommune as string | null) : undefined
  const categories =
    Array.isArray(p.categories) && p.categories.every((c) => typeof c === 'string')
      ? (p.categories as string[])
      : undefined

  if (fylke === undefined || kommune === undefined || categories === undefined) return null
  if (kommune && (!fylke || !kommune.startsWith(fylke))) return null

  return { fylke, kommune, categories }
}

export function saveFocus(focus: Focus): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...focus }))
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

  const regionOk =
    !focus.fylke || !ad.kommune
      ? true
      : focus.kommune
        ? ad.kommune === focus.kommune
        : ad.kommune.startsWith(focus.fylke)

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
    if (options?.persist !== false) saveFocus(next)
    setFocusState(next)
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
