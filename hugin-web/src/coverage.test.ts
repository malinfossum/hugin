import { describe, expect, it } from 'vitest'
import {
  effectiveDraft,
  fromDiscoveryConfig,
  kommunerInFylke,
  NO_OTHERS,
  removeOtherFylke,
  removeOtherKommune,
  switchFylke,
  toDiscoveryRequest,
  toFocusSeed,
} from './coverage'

const kommuner = [
  { number: '3405', name: 'Lillehammer' },
  { number: '3403', name: 'Hamar' },
  { number: '3909', name: 'Larvik' },
  { number: '3401', name: 'Åsnes' },
]

const larvik = { name: 'Larvik', number: '3909' }
const hamar = { name: 'Hamar', number: '3403' }

describe('toDiscoveryRequest', () => {
  it('empty fylke = all of Norway', () => {
    expect(toDiscoveryRequest({ fylke: '', kommuner: [], others: NO_OTHERS })).toEqual({
      municipalityNumbers: [],
      fylker: [],
      allOfNorway: true,
    })
  })

  it('fylke with no kommuner checked = the whole fylke', () => {
    expect(toDiscoveryRequest({ fylke: '34', kommuner: [], others: NO_OTHERS })).toEqual({
      municipalityNumbers: [],
      fylker: ['34'],
      allOfNorway: false,
    })
  })

  it('checked kommuner win over the fylke', () => {
    expect(
      toDiscoveryRequest({ fylke: '34', kommuner: ['3405', '3403'], others: NO_OTHERS })
    ).toEqual({
      municipalityNumbers: ['3405', '3403'],
      fylker: [],
      allOfNorway: false,
    })
  })

  it('merges coverage outside the rendered fylke into the same request', () => {
    expect(
      toDiscoveryRequest({
        fylke: '34',
        kommuner: ['3403'],
        others: { municipalities: [larvik], fylker: ['03'] },
      })
    ).toEqual({
      municipalityNumbers: ['3403', '3909'],
      fylker: ['03'],
      allOfNorway: false,
    })
    expect(
      toDiscoveryRequest({
        fylke: '34',
        kommuner: [],
        others: { municipalities: [larvik], fylker: ['03'] },
      })
    ).toEqual({
      municipalityNumbers: ['3909'],
      fylker: ['34', '03'],
      allOfNorway: false,
    })
  })

  it('all of Norway subsumes the others', () => {
    expect(
      toDiscoveryRequest({
        fylke: '',
        kommuner: [],
        others: { municipalities: [larvik], fylker: ['03'] },
      })
    ).toEqual({ municipalityNumbers: [], fylker: [], allOfNorway: true })
  })
})

describe('fromDiscoveryConfig', () => {
  it('maps allOfNorway, a fylke, and municipalities back to a draft', () => {
    expect(fromDiscoveryConfig({ municipalities: [], fylker: [], allOfNorway: true })).toEqual({
      fylke: '',
      kommuner: [],
      others: NO_OTHERS,
    })
    expect(fromDiscoveryConfig({ municipalities: [], fylker: ['39'], allOfNorway: false })).toEqual(
      {
        fylke: '39',
        kommuner: [],
        others: NO_OTHERS,
      }
    )
    expect(
      fromDiscoveryConfig({
        municipalities: [hamar, { name: 'Gjøvik', number: '3407' }],
        fylker: [],
        allOfNorway: false,
      })
    ).toEqual({ fylke: '34', kommuner: ['3403', '3407'], others: NO_OTHERS })
  })

  it('keeps kommuner and fylker outside the rendered fylke as others, nothing lost', () => {
    expect(
      fromDiscoveryConfig({
        municipalities: [hamar, larvik, { name: 'Gjøvik', number: '3407' }],
        fylker: [],
        allOfNorway: false,
      })
    ).toEqual({
      fylke: '34',
      kommuner: ['3403', '3407'],
      others: { municipalities: [larvik], fylker: [] },
    })
    // A whole-fylke entry renders first; every other entry is then outside it.
    expect(
      fromDiscoveryConfig({ municipalities: [larvik], fylker: ['34', '03'], allOfNorway: false })
    ).toEqual({ fylke: '34', kommuner: [], others: { municipalities: [larvik], fylker: ['03'] } })
  })

  it('an empty config is all of Norway', () => {
    expect(fromDiscoveryConfig({ municipalities: [], fylker: [], allOfNorway: false })).toEqual({
      fylke: '',
      kommuner: [],
      others: NO_OTHERS,
    })
  })
})

describe('switchFylke', () => {
  it('moves the checked kommuner out to others and pulls the next fylke’s in', () => {
    const draft = {
      fylke: '34',
      kommuner: ['3403'],
      others: { municipalities: [larvik], fylker: [] },
    }
    expect(switchFylke(draft, '39', kommuner)).toEqual({
      fylke: '39',
      kommuner: ['3909'],
      others: { municipalities: [hamar], fylker: [] },
    })
  })

  it('a fylke with nothing checked moves out as a whole fylke, and back in the same way', () => {
    const draft = { fylke: '34', kommuner: [], others: { municipalities: [], fylker: ['03'] } }
    const switched = switchFylke(draft, '03', kommuner)
    expect(switched).toEqual({
      fylke: '03',
      kommuner: [],
      others: { municipalities: [], fylker: ['34'] },
    })
    expect(switchFylke(switched, '34', kommuner)).toEqual(draft)
  })

  it('names a moved kommune by its number when the register list cannot name it', () => {
    const draft = { fylke: '34', kommuner: ['3499'], others: NO_OTHERS }
    expect(switchFylke(draft, '39', kommuner).others.municipalities).toEqual([
      { name: '3499', number: '3499' },
    ])
    expect(switchFylke(draft, '39', null).others.municipalities).toEqual([
      { name: '3499', number: '3499' },
    ])
  })

  it('a round trip through all of Norway loses nothing', () => {
    const draft = {
      fylke: '34',
      kommuner: ['3403'],
      others: { municipalities: [larvik], fylker: [] },
    }
    const everywhere = switchFylke(draft, '', kommuner)
    expect(everywhere).toEqual({
      fylke: '',
      kommuner: [],
      others: { municipalities: [larvik, hamar], fylker: [] },
    })
    expect(switchFylke(everywhere, '34', kommuner)).toEqual(draft)
  })

  it('re-selecting the current fylke changes nothing', () => {
    const draft = { fylke: '34', kommuner: ['3403'], others: NO_OTHERS }
    expect(switchFylke(draft, '34', kommuner)).toEqual(draft)
  })
})

describe('removeOtherKommune / removeOtherFylke', () => {
  it('drops exactly the named entry', () => {
    const draft = {
      fylke: '34',
      kommuner: ['3403'],
      others: { municipalities: [larvik, { name: 'Oslo', number: '0301' }], fylker: ['11'] },
    }
    expect(removeOtherKommune(draft, '3909')).toEqual({
      ...draft,
      others: { municipalities: [{ name: 'Oslo', number: '0301' }], fylker: ['11'] },
    })
    expect(removeOtherFylke(draft, '11')).toEqual({
      ...draft,
      others: { municipalities: [larvik, { name: 'Oslo', number: '0301' }], fylker: [] },
    })
  })
})

describe('toFocusSeed', () => {
  it('seeds the lens: fylke, a single checked kommune, and the categories', () => {
    expect(
      toFocusSeed({ fylke: '34', kommuner: ['3405'], others: NO_OTHERS }, ['Utvikling'])
    ).toEqual({
      fylke: '34',
      kommune: '3405',
      categories: ['Utvikling'],
    })
    expect(toFocusSeed({ fylke: '34', kommuner: ['3405', '3403'], others: NO_OTHERS }, [])).toEqual(
      {
        fylke: '34',
        kommune: null,
        categories: [],
      }
    )
    expect(toFocusSeed({ fylke: '', kommuner: [], others: NO_OTHERS }, [])).toEqual({
      fylke: null,
      kommune: null,
      categories: [],
    })
  })
})

describe('effectiveDraft', () => {
  it('drops the rendered fylke’s kommuner when the register list is unavailable, keeps others', () => {
    const others = { municipalities: [larvik], fylker: [] }
    expect(effectiveDraft({ fylke: '34', kommuner: ['3403', '3405'], others }, null)).toEqual({
      fylke: '34',
      kommuner: [],
      others,
    })
  })

  it('keeps the draft as-is when the list loaded', () => {
    const draft = { fylke: '34', kommuner: ['3403'], others: NO_OTHERS }
    expect(effectiveDraft(draft, kommuner)).toBe(draft)
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
