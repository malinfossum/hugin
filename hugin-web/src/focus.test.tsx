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

afterEach(() => {
  // localStorage bleeds between tests in this suite — clear our key every time so one test's
  // stored focus can't leak into the next.
  window.localStorage.removeItem(STORAGE_KEY)
})

describe('KNOWN_CATEGORIES', () => {
  it('is the two NAV level-2 categories Hugin syncs against', () => {
    expect(KNOWN_CATEGORIES).toEqual(['Utvikling', 'Drift, vedlikehold'])
  })
})

describe('storage round-trip', () => {
  it('saveFocus then loadFocus returns the same focus', () => {
    const focus: Focus = { fylke: '03', kommune: '0301', categories: ['Utvikling'] }
    saveFocus(focus)
    expect(loadFocus()).toEqual(focus)
  })

  it('clearFocus removes the stored value so loadFocus returns null', () => {
    saveFocus({ fylke: '03', kommune: null, categories: [] })
    clearFocus()
    expect(loadFocus()).toBeNull()
  })
})

describe('loadFocus validation', () => {
  it('returns null when the key is missing', () => {
    expect(loadFocus()).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadFocus()).toBeNull()
  })

  it('returns null when v is not 1', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 2, fylke: '03', kommune: null, categories: [] })
    )
    expect(loadFocus()).toBeNull()
  })

  it('returns null when categories is not an array', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, fylke: '03', kommune: null, categories: 'x' })
    )
    expect(loadFocus()).toBeNull()
  })

  it('returns null when kommune does not belong to fylke', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, fylke: '34', kommune: '0301', categories: [] })
    )
    expect(loadFocus()).toBeNull()
  })
})

describe('adMatchesFocus', () => {
  it('passes a tracked ad regardless of focus', () => {
    const ad = { kommune: '5001', category: 'IT / Salg', pipelineStatus: 'active' }
    const focus: Focus = { fylke: '03', kommune: '0301', categories: ['Utvikling'] }
    expect(adMatchesFocus(ad, focus)).toBe(true)
  })

  it('passes everything when focus is null', () => {
    const ad = { kommune: '5001', category: 'IT / Salg', pipelineStatus: null }
    expect(adMatchesFocus(ad, null)).toBe(true)
  })

  it('fails open on a null ad.kommune (region check skipped)', () => {
    const ad = { kommune: null, category: null, pipelineStatus: null }
    const focus: Focus = { fylke: '03', kommune: null, categories: [] }
    expect(adMatchesFocus(ad, focus)).toBe(true)
  })

  it('fails open on a null ad.category (category check skipped)', () => {
    const ad = { kommune: '0301', category: null, pipelineStatus: null }
    const focus: Focus = { fylke: '03', kommune: null, categories: ['Utvikling'] }
    expect(adMatchesFocus(ad, focus)).toBe(true)
  })

  it('matches region by kommune when focus.kommune is set', () => {
    const focus: Focus = { fylke: '03', kommune: '0301', categories: [] }
    expect(adMatchesFocus({ kommune: '0301', category: null, pipelineStatus: null }, focus)).toBe(
      true
    )
    expect(adMatchesFocus({ kommune: '0302', category: null, pipelineStatus: null }, focus)).toBe(
      false
    )
  })

  it('matches region by fylke prefix when focus.kommune is null', () => {
    const focus: Focus = { fylke: '03', kommune: null, categories: [] }
    expect(adMatchesFocus({ kommune: '0301', category: null, pipelineStatus: null }, focus)).toBe(
      true
    )
    expect(adMatchesFocus({ kommune: '3401', category: null, pipelineStatus: null }, focus)).toBe(
      false
    )
  })

  it('matches category by String.includes against any selected category', () => {
    const focus: Focus = { fylke: null, kommune: null, categories: ['Utvikling'] }
    expect(
      adMatchesFocus({ kommune: null, category: 'IT / Utvikling', pipelineStatus: null }, focus)
    ).toBe(true)
    expect(
      adMatchesFocus({ kommune: null, category: 'IT / Salg', pipelineStatus: null }, focus)
    ).toBe(false)
  })

  it('an empty categories selection matches every category', () => {
    const focus: Focus = { fylke: null, kommune: null, categories: [] }
    expect(
      adMatchesFocus({ kommune: null, category: 'IT / Salg', pipelineStatus: null }, focus)
    ).toBe(true)
  })
})

describe('FocusProvider / useFocus', () => {
  it('hydrates focus from localStorage on mount', () => {
    const stored: Focus = { fylke: '03', kommune: '0301', categories: ['Utvikling'] }
    saveFocus(stored)

    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })

    expect(result.current.focus).toEqual(stored)
  })

  it('starts null when nothing is stored', () => {
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })
    expect(result.current.focus).toBeNull()
  })

  it('setFocus persists to localStorage and updates context state', () => {
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })
    const next: Focus = { fylke: '11', kommune: null, categories: ['Drift, vedlikehold'] }

    act(() => {
      result.current.setFocus(next)
    })

    expect(result.current.focus).toEqual(next)
    expect(loadFocus()).toEqual(next)
  })

  it('setFocus with persist:false updates context state but leaves storage untouched', () => {
    // The first-run dialog seeds the lens on a failed PUT so it works for this session — but
    // nothing may be stored, or the dialog would never come back on the next launch.
    const { result } = renderHook(() => useFocus(), { wrapper: FocusProvider })
    const next: Focus = { fylke: '11', kommune: null, categories: [] }

    act(() => {
      result.current.setFocus(next, { persist: false })
    })

    expect(result.current.focus).toEqual(next)
    expect(loadFocus()).toBeNull()
  })

  it('resetFocus clears storage and sets focus back to null', () => {
    saveFocus({ fylke: '03', kommune: '0301', categories: [] })
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
