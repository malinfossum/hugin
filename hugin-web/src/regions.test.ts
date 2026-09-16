import { describe, expect, it } from 'vitest'
import {
  normalizeRegions,
  type Region,
  regionFor,
  regionMatches,
  tickFylke,
  tickKommune,
  untickFylke,
  untickKommune,
} from './regions'

const innlandetHamar: Region = { fylke: '34', kommuner: ['3403'] }
const vestfold: Region = { fylke: '39', kommuner: [] }

describe('normalizeRegions', () => {
  it('sorts regions by fylke and kommuner by number, and dedupes kommuner', () => {
    expect(
      normalizeRegions([
        { fylke: '39', kommuner: [] },
        { fylke: '34', kommuner: ['3407', '3403', '3407'] },
      ])
    ).toEqual([
      { fylke: '34', kommuner: ['3403', '3407'] },
      { fylke: '39', kommuner: [] },
    ])
  })

  it('does not mutate its input', () => {
    const input = [{ fylke: '34', kommuner: ['3407', '3403'] }]
    normalizeRegions(input)
    expect(input).toEqual([{ fylke: '34', kommuner: ['3407', '3403'] }])
  })
})

describe('regionFor', () => {
  it('finds the region for a fylke, or undefined', () => {
    expect(regionFor([innlandetHamar, vestfold], '39')).toEqual(vestfold)
    expect(regionFor([innlandetHamar], '03')).toBeUndefined()
  })
})

describe('regionMatches', () => {
  it('empty regions match every kommune', () => {
    expect(regionMatches('0301', [])).toBe(true)
  })

  it('fails open on a missing kommune', () => {
    expect(regionMatches(null, [innlandetHamar])).toBe(true)
  })

  it('a whole fylke matches every kommune in it and nothing outside', () => {
    expect(regionMatches('3905', [vestfold])).toBe(true)
    expect(regionMatches('3403', [vestfold])).toBe(false)
  })

  it('a narrowed fylke matches only the listed kommuner', () => {
    expect(regionMatches('3403', [innlandetHamar])).toBe(true)
    expect(regionMatches('3405', [innlandetHamar])).toBe(false)
  })

  it('any region may match', () => {
    expect(regionMatches('3907', [innlandetHamar, vestfold])).toBe(true)
    expect(regionMatches('0301', [innlandetHamar, vestfold])).toBe(false)
  })
})

describe('tick rules', () => {
  it('tickFylke adds a whole fylke, clearing any kommuner ticked under it', () => {
    expect(tickFylke([innlandetHamar], '34')).toEqual([{ fylke: '34', kommuner: [] }])
    expect(tickFylke([innlandetHamar], '39')).toEqual([innlandetHamar, vestfold])
  })

  it('untickFylke removes the region and its kommuner', () => {
    expect(untickFylke([innlandetHamar, vestfold], '34')).toEqual([vestfold])
    expect(untickFylke([vestfold], '34')).toEqual([vestfold])
  })

  it('tickKommune creates a narrowed region when the fylke has none', () => {
    expect(tickKommune([], '3403')).toEqual([innlandetHamar])
  })

  it('tickKommune adds to an existing narrowed region, in number order', () => {
    expect(tickKommune([{ fylke: '34', kommuner: ['3407'] }], '3403')).toEqual([
      { fylke: '34', kommuner: ['3403', '3407'] },
    ])
  })

  it('tickKommune under a whole fylke narrows it to that kommune', () => {
    expect(tickKommune([{ fylke: '34', kommuner: [] }], '3403')).toEqual([innlandetHamar])
  })

  it('tickKommune ignores a kommune without a fylke prefix', () => {
    expect(tickKommune([vestfold], '')).toEqual([vestfold])
  })

  it('untickKommune removes one kommune from a narrowed region', () => {
    expect(untickKommune([{ fylke: '34', kommuner: ['3403', '3407'] }], '3407')).toEqual([
      innlandetHamar,
    ])
  })

  it('unticking the last kommune leaves the whole fylke, never widens to nothing', () => {
    expect(untickKommune([innlandetHamar], '3403')).toEqual([{ fylke: '34', kommuner: [] }])
  })

  it('untickKommune is a no-op when the fylke has no region', () => {
    expect(untickKommune([vestfold], '3403')).toEqual([vestfold])
  })
})
