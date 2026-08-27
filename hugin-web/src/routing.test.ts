import { describe, expect, it } from 'vitest'
import { parseRoute, routePath } from './routing'

describe('routing', () => {
  it('parses "/" as dashboard', () => {
    expect(parseRoute('/')).toEqual({ view: 'dashboard', company: null })
  })

  it('parses "/applications"', () => {
    expect(parseRoute('/applications')).toEqual({ view: 'applications', company: null })
  })

  it('parses "/companies"', () => {
    expect(parseRoute('/companies')).toEqual({ view: 'companies', company: null })
  })

  it('parses "/companies/<orgnr>" with the company set', () => {
    expect(parseRoute('/companies/972483672')).toEqual({
      view: 'companies',
      company: '972483672',
    })
  })

  it('parses "/export"', () => {
    expect(parseRoute('/export')).toEqual({ view: 'export', company: null })
  })

  it('parses "/settings"', () => {
    expect(parseRoute('/settings')).toEqual({ view: 'settings', company: null })
  })

  it('parses an unknown path as dashboard', () => {
    expect(parseRoute('/nonsense')).toEqual({ view: 'dashboard', company: null })
  })

  it('round-trips routePath(parseRoute(path)) for each view', () => {
    for (const path of ['/', '/applications', '/companies', '/export', '/settings']) {
      expect(routePath(parseRoute(path))).toBe(path)
    }
  })

  it('round-trips a company deep link', () => {
    const route = parseRoute('/companies/972483672')
    expect(routePath(route)).toBe('/companies/972483672')
  })

  it('routePath ignores a stray company on non-companies views', () => {
    expect(routePath({ view: 'dashboard', company: '972483672' })).toBe('/')
  })
})
