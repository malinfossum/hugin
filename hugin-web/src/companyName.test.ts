import { describe, expect, it } from 'vitest'
import { displayCompanyName } from './companyName'

describe('displayCompanyName', () => {
  it('title-cases an all-caps Brreg name, suffix stays uppercase', () => {
    expect(displayCompanyName('NORSK TIPPING AS')).toBe('Norsk Tipping AS')
  })
  it('handles branch names', () => {
    expect(displayCompanyName('SOPRA STERIA AVD HAMAR')).toBe('Sopra Steria Avd Hamar')
  })
  it('title-cases each hyphenated part', () => {
    expect(displayCompanyName('EL-INSTALLATØREN GJØVIK DA')).toBe('El-Installatøren Gjøvik DA')
  })
  it('keeps every known legal form uppercase', () => {
    expect(displayCompanyName('EKSEMPEL ASA')).toBe('Eksempel ASA')
    expect(displayCompanyName('EKSEMPEL IKS')).toBe('Eksempel IKS')
    expect(displayCompanyName('EKSEMPEL HF')).toBe('Eksempel HF')
  })
  it('passes mixed-case names through untouched', () => {
    expect(displayCompanyName('Norsk Tipping AS')).toBe('Norsk Tipping AS')
    expect(displayCompanyName('innit AS')).toBe('innit AS')
  })
  it('handles norwegian letters', () => {
    expect(displayCompanyName('GJØVIK VÆRKSTED ANS')).toBe('Gjøvik Værksted ANS')
  })
})
