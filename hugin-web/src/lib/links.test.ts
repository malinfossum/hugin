import { describe, expect, it } from 'vitest'
import { sourceLabel } from './links'

describe('sourceLabel', () => {
  it('shortens finn.no to FINN', () => {
    expect(
      sourceLabel(
        'https://www.finn.no/job/search?q=utvikler',
        'Ledige utviklerjobber på FINN Innlandet'
      )
    ).toBe('FINN')
  })
  it('shortens linkedin.com to LinkedIn', () => {
    expect(sourceLabel('https://www.linkedin.com/jobs/search/?keywords=utvikler', 'x')).toBe(
      'LinkedIn'
    )
  })
  it('keeps the config label for unknown domains', () => {
    expect(sourceLabel('https://example.com/jobs', 'Eksempel')).toBe('Eksempel')
  })
  it('keeps the config label for invalid URLs', () => {
    expect(sourceLabel('not a url', 'Rar lenke')).toBe('Rar lenke')
  })
  it('does not match a domain that merely ends with finn.no', () => {
    expect(sourceLabel('https://notfinn.no/jobs', 'X')).toBe('X')
  })
  it('matches a linkedin.com subdomain', () => {
    expect(sourceLabel('https://no.linkedin.com/jobs', 'X')).toBe('LinkedIn')
  })
})
