import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { en } from './en'
import { detectLang } from './index'
import { nb } from './nb'

describe('i18n key parity', () => {
  it('nb and en export identical key sets (drift guard)', () => {
    const nbKeys = new Set(Object.keys(nb))
    const enKeys = new Set(Object.keys(en))

    expect(nbKeys).toEqual(enKeys)
  })

  it('neither table has empty string values', () => {
    for (const [key, value] of Object.entries(nb)) {
      expect(value, `nb.${key}`).not.toBe('')
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.${key}`).not.toBe('')
    }
  })
})

describe('detectLang (browser fallback, no stored preference)', () => {
  const originalLanguage = navigator.language

  beforeEach(() => {
    // test-setup.ts pins every test to nb via localStorage — clear it here so these tests
    // actually exercise the navigator.language branch instead of short-circuiting on it.
    window.localStorage.removeItem('hugin-lang')
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'language', {
      value: originalLanguage,
      configurable: true,
    })
  })

  function mockNavigatorLanguage(value: string): void {
    Object.defineProperty(navigator, 'language', { value, configurable: true })
  }

  it('nn-NO (Nynorsk) resolves to nb — Norwegian users never fall through to English', () => {
    mockNavigatorLanguage('nn-NO')
    expect(detectLang()).toBe('nb')
  })

  it('nb-NO resolves to nb', () => {
    mockNavigatorLanguage('nb-NO')
    expect(detectLang()).toBe('nb')
  })

  it('sv-SE resolves to en (not Norwegian)', () => {
    mockNavigatorLanguage('sv-SE')
    expect(detectLang()).toBe('en')
  })

  it('en-US resolves to en', () => {
    mockNavigatorLanguage('en-US')
    expect(detectLang()).toBe('en')
  })
})
