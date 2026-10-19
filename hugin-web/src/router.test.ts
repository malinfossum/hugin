import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from './router'
import { Route as CompaniesRoute } from './routes/companies.{-$orgnr}'
import { Route as IndexRoute } from './routes/index'

function scrollKeyAt(url: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
  return router.options.getScrollRestorationKey?.(router.latestLocation)
}

describe('scroll restoration key', () => {
  it('is the path, so a page reached again through the nav returns to where it was left', () => {
    expect(scrollKeyAt('/companies')).toBe('/companies')
  })

  it('gives a company detail the list key: the detail is a dialog over the list', () => {
    expect(scrollKeyAt('/companies/715787630')).toBe('/companies')
  })

  it('ignores search params, so a filter does not start the list over at the top', () => {
    expect(scrollKeyAt('/companies?q=acme&ads=open')).toBe('/companies')
  })
})

/** A route's validateSearch, as the router calls it on whatever the URL holds. */
function validatorOf(route: { options: { validateSearch?: unknown } }) {
  return route.options.validateSearch as (search: Record<string, unknown>) => unknown
}

describe('companies route search params', () => {
  const validate = validatorOf(CompaniesRoute)

  it('keeps the three filters when they hold known values', () => {
    expect(validate({ q: 'acme', website: 'has', ads: 'open' })).toEqual({
      q: 'acme',
      website: 'has',
      ads: 'open',
    })
    expect(validate({ website: 'none' })).toMatchObject({ website: 'none' })
  })

  it('reads a numeric search as text, since the URL parser turns "123" into a number', () => {
    expect(validate({ q: 123 })).toMatchObject({ q: '123' })
  })

  it('drops an empty search and junk values', () => {
    expect(validate({ q: '', website: 'maybe', ads: 'closed', extra: 'x' })).toEqual({
      q: undefined,
      website: undefined,
      ads: undefined,
    })
  })
})

describe('dashboard route search params', () => {
  const validate = validatorOf(IndexRoute)

  it('keeps ?show=all', () => {
    expect(validate({ show: 'all' })).toEqual({ show: 'all' })
  })

  it('drops any other show value and unknown params', () => {
    expect(validate({ show: 'active' })).toEqual({})
    expect(validate({ show: 'everything', extra: 1 })).toEqual({})
  })
})
