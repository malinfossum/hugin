import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  adMatchesFocus,
  clearFocus,
  type Focus,
  FocusProvider,
  KNOWN_CATEGORIES,
  loadFocus,
  saveFocus,
  useFocus,
} from './focus'

const STORAGE_KEY = 'hugin-focus'

const innlandet: Focus = { regions: [{ fylke: '34', kommuner: [] }], categories: [] }
const hamarAndVestfold: Focus = {
  regions: [
    { fylke: '34', kommuner: ['3403'] },
    { fylke: '39', kommuner: [] },
  ],
  categories: ['Utvikling'],
}

const store = (record: unknown) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')

afterEach(() => {
  window.localStorage.removeItem(STORAGE_KEY)
})

describe('KNOWN_CATEGORIES', () => {
  it('is the two NAV level-2 categories Hugin syncs against', () => {
    expect(KNOWN_CATEGORIES).toEqual(['Utvikling', 'Drift, vedlikehold'])
  })
})

describe('storage round-trip (v2)', () => {
  it('saveFocus then loadFocus returns the same focus', () => {
    saveFocus(hamarAndVestfold)
    expect(loadFocus()).toEqual(hamarAndVestfold)
  })

  it('writes schema version 2 under the existing key', () => {
    saveFocus(innlandet)
    expect(stored()).toEqual({ v: 2, regions: [{ fylke: '34', kommuner: [] }], categories: [] })
  })

  it('saveFocus normalises: regions by fylke, kommuner by number, deduped', () => {
    saveFocus({
      regions: [
        { fylke: '39', kommuner: [] },
        { fylke: '34', kommuner: ['3407', '3403', '3407'] },
      ],
      categories: [],
    })
    expect(stored().regions).toEqual([
      { fylke: '34', kommuner: ['3403', '3407'] },
      { fylke: '39', kommuner: [] },
    ])
  })

  it('clearFocus removes the stored value so loadFocus returns null', () => {
    saveFocus(innlandet)
    clearFocus()
    expect(loadFocus()).toBeNull()
  })
})

describe('loadFocus validation (v2)', () => {
  it('returns null when the key is missing', () => {
    expect(loadFocus()).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadFocus()).toBeNull()
  })

  it('returns null when v is neither 1 nor 2', () => {
    store({ v: 3, regions: [], categories: [] })
    expect(loadFocus()).toBeNull()
  })

  it('returns null when categories is not an array of strings', () => {
    store({ v: 2, regions: [], categories: 'x' })
    expect(loadFocus()).toBeNull()
    store({ v: 2, regions: [], categories: [1] })
    expect(loadFocus()).toBeNull()
  })

  it('returns null when regions is not an array of { fylke, kommuner[] }', () => {
    store({ v: 2, regions: 'x', categories: [] })
    expect(loadFocus()).toBeNull()
    store({ v: 2, regions: [{ fylke: '34' }], categories: [] })
    expect(loadFocus()).toBeNull()
    store({ v: 2, regions: [{ fylke: 34, kommuner: [] }], categories: [] })
    expect(loadFocus()).toBeNull()
  })

  it('returns null for a fylke that is not in FYLKER', () => {
    store({ v: 2, regions: [{ fylke: '99', kommuner: [] }], categories: [] })
    expect(loadFocus()).toBeNull()
  })

  it('returns null when two regions share a fylke', () => {
    store({
      v: 2,
      regions: [
        { fylke: '34', kommuner: [] },
        { fylke: '34', kommuner: ['3403'] },
      ],
      categories: [],
    })
    expect(loadFocus()).toBeNull()
  })

  it('returns null for a kommune outside its region’s fylke', () => {
    store({ v: 2, regions: [{ fylke: '34', kommuner: ['0301'] }], categories: [] })
    expect(loadFocus()).toBeNull()
  })

  it('returns null for a kommune that is not exactly four digits', () => {
    store({ v: 2, regions: [{ fylke: '34', kommuner: ['34031'] }], categories: [] })
    expect(loadFocus()).toBeNull()
    store({ v: 2, regions: [{ fylke: '34', kommuner: ['34ab'] }], categories: [] })
    expect(loadFocus()).toBeNull()
  })

  it('does not check kommuner against the register — an unknown number is kept', () => {
    store({ v: 2, regions: [{ fylke: '34', kommuner: ['3499'] }], categories: [] })
    expect(loadFocus()).toEqual({ regions: [{ fylke: '34', kommuner: ['3499'] }], categories: [] })
  })

  it('normalises a hand-edited v2 record on read', () => {
    store({
      v: 2,
      regions: [
        { fylke: '39', kommuner: [] },
        { fylke: '34', kommuner: ['3407', '3403'] },
      ],
      categories: [],
    })
    expect(loadFocus()?.regions).toEqual([
      { fylke: '34', kommuner: ['3403', '3407'] },
      { fylke: '39', kommuner: [] },
    ])
  })
})

describe('migration from v1', () => {
  it('fylke null, kommune null → all of Norway', () => {
    store({ v: 1, fylke: null, kommune: null, categories: ['Utvikling'] })
    expect(loadFocus()).toEqual({ regions: [], categories: ['Utvikling'] })
  })

  it('fylke only → one whole region', () => {
    store({ v: 1, fylke: '34', kommune: null, categories: [] })
    expect(loadFocus()).toEqual(innlandet)
  })

  it('fylke + kommune → one narrowed region', () => {
    store({ v: 1, fylke: '34', kommune: '3403', categories: [] })
    expect(loadFocus()).toEqual({ regions: [{ fylke: '34', kommuner: ['3403'] }], categories: [] })
  })

  it('writes the converted record back as v2', () => {
    store({ v: 1, fylke: '34', kommune: '3403', categories: [] })
    loadFocus()
    expect(stored()).toEqual({
      v: 2,
      regions: [{ fylke: '34', kommuner: ['3403'] }],
      categories: [],
    })
  })

  it('a v1 record that fails the v1 checks still returns null and is not rewritten', () => {
    store({ v: 1, fylke: '34', kommune: '0301', categories: [] })
    expect(loadFocus()).toBeNull()
    expect(stored().v).toBe(1)
    store({ v: 1, fylke: '03', kommune: null, categories: 'x' })
    expect(loadFocus()).toBeNull()
  })
})

const ad = (
  kommune: string | null,
  extra: Partial<{ category: string | null; pipelineStatus: string | null }> = {}
) => ({
  kommune,
  category: extra.category ?? null,
  pipelineStatus: extra.pipelineStatus ?? null,
})

describe('adMatchesFocus', () => {
  it('passes everything when focus is null', () => {
    expect(adMatchesFocus(ad('5001', { category: 'IT / Salg' }), null)).toBe(true)
  })

  it('passes a tracked ad regardless of focus', () => {
    expect(
      adMatchesFocus(
        ad('5001', { category: 'IT / Salg', pipelineStatus: 'active' }),
        hamarAndVestfold
      )
    ).toBe(true)
  })

  it('empty regions match every kommune', () => {
    expect(adMatchesFocus(ad('5001'), { regions: [], categories: [] })).toBe(true)
  })

  it('a whole fylke matches its kommuner and nothing outside', () => {
    expect(adMatchesFocus(ad('3405'), innlandet)).toBe(true)
    expect(adMatchesFocus(ad('0301'), innlandet)).toBe(false)
  })

  it('a narrowed fylke matches only the listed kommuner', () => {
    expect(adMatchesFocus(ad('3403'), hamarAndVestfold)).toBe(true)
    expect(adMatchesFocus(ad('3405'), hamarAndVestfold)).toBe(false)
  })

  it('a kommune in another region’s fylke matches through that region', () => {
    expect(adMatchesFocus(ad('3907'), hamarAndVestfold)).toBe(true)
  })

  it('fails open on a null ad.kommune', () => {
    expect(adMatchesFocus(ad(null), innlandet)).toBe(true)
  })

  it('category rule is unchanged: String.includes, fail open on null, empty = all', () => {
    const focus: Focus = { regions: [], categories: ['Utvikling'] }
    expect(adMatchesFocus(ad('3403', { category: 'IT / Utvikling' }), focus)).toBe(true)
    expect(adMatchesFocus(ad('3403', { category: 'IT / Salg' }), focus)).toBe(false)
    expect(adMatchesFocus(ad('3403'), focus)).toBe(true)
    expect(
      adMatchesFocus(ad('3403', { category: 'IT / Salg' }), { regions: [], categories: [] })
    ).toBe(true)
  })

  it('region and category must both pass', () => {
    expect(adMatchesFocus(ad('3403', { category: 'IT / Salg' }), hamarAndVestfold)).toBe(false)
    expect(adMatchesFocus(ad('0301', { category: 'IT / Utvikling' }), hamarAndVestfold)).toBe(false)
  })
})

describe('FocusProvider / useFocus', () => {
  it('hydrates focus from localStorage on mount', () => {
    saveFocus(hamarAndVestfold)
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })
    expect(result.current.focus).toEqual(hamarAndVestfold)
  })

  it('starts null when nothing is stored', () => {
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })
    expect(result.current.focus).toBeNull()
  })

  it('setFocus persists to localStorage and updates context state, normalised', () => {
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })

    act(() => {
      result.current.setFocus({
        regions: [
          { fylke: '39', kommuner: [] },
          { fylke: '34', kommuner: ['3407', '3403'] },
        ],
        categories: ['Drift, vedlikehold'],
      })
    })

    const expected: Focus = {
      regions: [
        { fylke: '34', kommuner: ['3403', '3407'] },
        { fylke: '39', kommuner: [] },
      ],
      categories: ['Drift, vedlikehold'],
    }
    expect(result.current.focus).toEqual(expected)
    expect(loadFocus()).toEqual(expected)
  })

  it('setFocus with persist:false updates context state but leaves storage untouched', () => {
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })

    act(() => {
      result.current.setFocus(innlandet, { persist: false })
    })

    expect(result.current.focus).toEqual(innlandet)
    expect(loadFocus()).toBeNull()
  })

  it('resetFocus clears storage and sets focus back to null', () => {
    saveFocus(innlandet)
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })

    act(() => {
      result.current.resetFocus()
    })

    expect(result.current.focus).toBeNull()
    expect(loadFocus()).toBeNull()
  })

  it('exposes the default no-op context value when rendered without a Provider', () => {
    function Consumer() {
      const { focus } = useFocus()
      return <div>{focus === null ? 'no-focus' : 'has-focus'}</div>
    }
    render(<Consumer />)
    expect(screen.getByText('no-focus')).toBeInTheDocument()
  })
})
