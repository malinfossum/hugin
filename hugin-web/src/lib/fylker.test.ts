import { describe, expect, it } from 'vitest'
import { FYLKER, fylkeName, fylkeOf } from './fylker'

describe('fylker', () => {
  it('maps the 2024 fylke set', () => {
    expect(FYLKER.get('34')).toBe('Innlandet')
    expect(FYLKER.size).toBe(15)
  })
  it('derives fylke from a kommunenummer prefix', () => {
    expect(fylkeOf('3403')).toBe('34')
    expect(fylkeOf(null)).toBeNull()
    expect(fylkeOf('7')).toBeNull()
  })
  it('falls back to the raw number for unknown fylker', () => {
    expect(fylkeName('99')).toBe('99')
  })
})
