import { describe, expect, it } from 'vitest'
import { fromDiscoveryConfig, kommunerInFylke, toDiscoveryRequest, toFocusSeed } from './coverage'

const kommuner = [
  { number: '3405', name: 'Lillehammer' },
  { number: '3403', name: 'Hamar' },
  { number: '3909', name: 'Larvik' },
  { number: '3401', name: 'Åsnes' },
]

describe('toDiscoveryRequest', () => {
  it('empty fylke = all of Norway', () => {
    expect(toDiscoveryRequest({ fylke: '', kommuner: [] })).toEqual({
      municipalityNumbers: [],
      fylker: [],
      allOfNorway: true,
    })
  })

  it('fylke with no kommuner checked = the whole fylke', () => {
    expect(toDiscoveryRequest({ fylke: '34', kommuner: [] })).toEqual({
      municipalityNumbers: [],
      fylker: ['34'],
      allOfNorway: false,
    })
  })

  it('checked kommuner win over the fylke', () => {
    expect(toDiscoveryRequest({ fylke: '34', kommuner: ['3405', '3403'] })).toEqual({
      municipalityNumbers: ['3405', '3403'],
      fylker: [],
      allOfNorway: false,
    })
  })
})

describe('fromDiscoveryConfig', () => {
  it('maps allOfNorway, a fylke, and municipalities back to a draft', () => {
    expect(fromDiscoveryConfig({ municipalities: [], fylker: [], allOfNorway: true })).toEqual({
      fylke: '',
      kommuner: [],
    })
    expect(fromDiscoveryConfig({ municipalities: [], fylker: ['39'], allOfNorway: false })).toEqual(
      {
        fylke: '39',
        kommuner: [],
      }
    )
    expect(
      fromDiscoveryConfig({
        municipalities: [
          { name: 'Hamar', number: '3403' },
          { name: 'Larvik', number: '3909' },
          { name: 'Gjøvik', number: '3407' },
        ],
        fylker: [],
        allOfNorway: false,
      })
    ).toEqual({ fylke: '34', kommuner: ['3403', '3407'] })
  })

  it('an empty config is all of Norway', () => {
    expect(fromDiscoveryConfig({ municipalities: [], fylker: [], allOfNorway: false })).toEqual({
      fylke: '',
      kommuner: [],
    })
  })
})

describe('toFocusSeed', () => {
  it('seeds the lens: fylke, a single checked kommune, and the categories', () => {
    expect(toFocusSeed({ fylke: '34', kommuner: ['3405'] }, ['Utvikling'])).toEqual({
      fylke: '34',
      kommune: '3405',
      categories: ['Utvikling'],
    })
    expect(toFocusSeed({ fylke: '34', kommuner: ['3405', '3403'] }, [])).toEqual({
      fylke: '34',
      kommune: null,
      categories: [],
    })
    expect(toFocusSeed({ fylke: '', kommuner: [] }, [])).toEqual({
      fylke: null,
      kommune: null,
      categories: [],
    })
  })
})

describe('kommunerInFylke', () => {
  it('filters by prefix and sorts by name with Norwegian collation', () => {
    expect(kommunerInFylke(kommuner, '34').map((k) => k.name)).toEqual([
      'Hamar',
      'Lillehammer',
      'Åsnes',
    ])
    expect(kommunerInFylke(kommuner, '')).toEqual([])
  })
})
