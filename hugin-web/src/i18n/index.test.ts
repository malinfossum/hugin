import { describe, expect, it } from 'vitest'
import { en } from './en'
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
