import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { queryKeys } from '../lib/queries'
import { makeQueryClient } from '../lib/queryClient'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../lib/types'
import { TestQueryProvider } from '../test-utils'
import { CompanyDetail } from './CompanyDetail'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function company(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return {
    orgnr: '777777777',
    name: 'Nyfjell Spill AS',
    kommune: '3403',
    kommuneNavn: 'Hamar',
    naceCode: '62.010',
    isBranch: false,
    website: null,
    parentOrgnr: null,
    openAds: 0,
    ...overrides,
  }
}

function ad(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Nyfjell Spill AS',
    employerOrgnr: '777777777',
    kommune: '3403',
    kommuneNavn: null,
    expires: '2026-08-25T00:00:00Z',
    daysLeft: null,
    category: 'IT',
    sourceUrl: 'https://nav.no/stillinger/a1',
    pipelineStatus: null,
    hidden: false,
    isActive: true,
    linkedOrgnr: null,
    published: '2026-08-12T00:00:00Z',
    ...overrides,
  }
}

/** Fake server: GET /api/companies/{orgnr} -> a detail or 404, tracking call count per orgnr
 * so tests can assert the per-unit cache is actually used. */
function fakeServer(details: Record<string, CompanyDetailDto>) {
  const calls: Record<string, number> = {}
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const match = url.match(/^\/api\/companies\/(.+)$/)
    if (!match) return Promise.reject(new Error(`unhandled request ${url}`))
    const orgnr = match[1]
    calls[orgnr] = (calls[orgnr] ?? 0) + 1
    const detail = details[orgnr]
    if (!detail) {
      return Promise.resolve(jsonResponse({ title: `Fant ikke orgnr ${orgnr}.` }, { status: 404 }))
    }
    return Promise.resolve(jsonResponse(detail))
  })
  return { fetchMock, calls }
}

function renderDetail(fetchMock: ReturnType<typeof vi.fn>, orgnr = '777777777') {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <TestQueryProvider>
      <LanguageProvider>
        <CompanyDetail orgnr={orgnr} onClose={vi.fn()} />
      </LanguageProvider>
    </TestQueryProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CompanyDetail', () => {
  it('renders no tablist when the unit has no branches', async () => {
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: company(), ads: [], branches: [] },
    }
    const { fetchMock } = fakeServer(details)
    renderDetail(fetchMock)

    await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('focuses the heading when a retry succeeds after cached data was hidden by an error', async () => {
    const detail: CompanyDetailDto = { company: company(), ads: [], branches: [] }
    const { fetchMock } = fakeServer({ '777777777': detail })
    vi.stubGlobal('fetch', fetchMock)
    // Cached data plus a failed refetch: the error hides the body, the heading does not exist.
    const client = makeQueryClient()
    client.setQueryData(queryKeys.company('777777777'), detail)
    client
      .getQueryCache()
      .find({ queryKey: queryKeys.company('777777777') })
      ?.setState({
        status: 'error',
        error: new Error('offline'),
      })
    const user = userEvent.setup()
    render(
      <TestQueryProvider client={client}>
        <LanguageProvider>
          <CompanyDetail orgnr="777777777" onClose={vi.fn()} />
        </LanguageProvider>
      </TestQueryProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'Prøv igjen' }))

    const heading = await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('renders a tablist with the main unit plus one tab per branch, labeled by kommuneNavn', async () => {
    const oslo = company({
      orgnr: '787878787',
      name: 'NYFJELL SPILL AS AVDELING OSLO',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
    })
    const bergen = company({
      orgnr: '111222333',
      name: 'NYFJELL SPILL AS AVDELING BERGEN',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Bergen',
    })
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: company(), ads: [], branches: [oslo, bergen] },
    }
    const { fetchMock } = fakeServer(details)
    renderDetail(fetchMock)

    await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })
    const tablist = await screen.findByRole('tablist', { name: 'Enheter' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Hovedenhet', 'Oslo', 'Bergen'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabIndex', '0')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[1]).toHaveAttribute('tabIndex', '-1')
  })

  it('falls back to the display name when a branch has no kommuneNavn, or it duplicates another branch tab', async () => {
    const noKommune = company({
      orgnr: '1',
      name: 'NYFJELL SPILL AS AVDELING X',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: null,
    })
    const dupA = company({
      orgnr: '2',
      name: 'NYFJELL SPILL AS AVDELING OSLO',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
    })
    const dupB = company({
      orgnr: '3',
      name: 'NYFJELL SPILL AS AVDELING OSLO SENTRUM',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
    })
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: company(), ads: [], branches: [noKommune, dupA, dupB] },
    }
    const { fetchMock } = fakeServer(details)
    renderDetail(fetchMock)

    const tablist = await screen.findByRole('tablist')
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Hovedenhet',
      'Nyfjell Spill AS Avdeling X',
      'Nyfjell Spill AS Avdeling Oslo',
      'Nyfjell Spill AS Avdeling Oslo Sentrum',
    ])
  })

  it('clicking a branch tab fetches that unit and renders its dl + ad history', async () => {
    const oslo = company({
      orgnr: '787878787',
      name: 'NYFJELL SPILL AS AVDELING OSLO',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
      website: 'https://oslo.example',
    })
    const details: Record<string, CompanyDetailDto> = {
      '777777777': {
        company: company(),
        ads: [ad({ feedId: 'main-ad', title: 'Hovedannonse' })],
        branches: [oslo],
      },
      '787878787': {
        company: oslo,
        ads: [ad({ feedId: 'oslo-ad', title: 'Oslo-annonse' })],
        branches: [],
      },
    }
    const { fetchMock, calls } = fakeServer(details)
    const user = userEvent.setup()
    renderDetail(fetchMock)

    await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })
    expect(screen.getByText('Hovedannonse')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Oslo' }))

    expect(
      await screen.findByRole('heading', { name: /Nyfjell Spill AS Avdeling Oslo/ })
    ).toBeInTheDocument()
    // The heading takes focus once per opened company: a branch tab keeps it.
    expect(screen.getByRole('tab', { name: 'Oslo' })).toHaveFocus()
    expect(screen.getByText('Oslo-annonse')).toBeInTheDocument()
    expect(screen.queryByText('Hovedannonse')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'https://oslo.example' })
    expect(link).toHaveAttribute('href', 'https://oslo.example')

    // Switching back to the main tab does not refetch it. The cache holds it.
    await user.click(screen.getByRole('tab', { name: 'Hovedenhet' }))
    await screen.findByText('Hovedannonse')
    expect(calls['777777777']).toBe(1)
    expect(calls['787878787']).toBe(1)
  })

  it('reopening a company while mounted lands on its own unit, not the branch tab picked before', async () => {
    const oslo = company({
      orgnr: '787878787',
      name: 'NYFJELL SPILL AS AVDELING OSLO',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
    })
    const other = company({ orgnr: '999888777', name: 'Annet Firma AS' })
    const { fetchMock } = fakeServer({
      '777777777': { company: company(), ads: [], branches: [oslo] },
      '787878787': { company: oslo, ads: [], branches: [] },
      '999888777': { company: other, ads: [], branches: [] },
    })
    const user = userEvent.setup()
    const tree = (orgnr: string) => (
      <TestQueryProvider>
        <LanguageProvider>
          <CompanyDetail orgnr={orgnr} onClose={vi.fn()} />
        </LanguageProvider>
      </TestQueryProvider>
    )
    const { rerender } = renderDetail(fetchMock)

    await user.click(await screen.findByRole('tab', { name: 'Oslo' }))
    await screen.findByRole('heading', { name: /Nyfjell Spill AS Avdeling Oslo/ })

    rerender(tree('999888777'))
    await screen.findByRole('heading', { name: 'Annet Firma AS' })

    rerender(tree('777777777'))
    expect(await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Hovedenhet' })).toHaveAttribute('aria-selected', 'true')
  })

  it('moves focus (and selection) across tabs with ArrowRight/ArrowLeft: roving tabindex', async () => {
    const oslo = company({
      orgnr: '787878787',
      name: 'NYFJELL SPILL AS AVDELING OSLO',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Oslo',
    })
    const bergen = company({
      orgnr: '111222333',
      name: 'NYFJELL SPILL AS AVDELING BERGEN',
      isBranch: true,
      parentOrgnr: '777777777',
      kommuneNavn: 'Bergen',
    })
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: company(), ads: [], branches: [oslo, bergen] },
      '787878787': { company: oslo, ads: [], branches: [] },
      '111222333': { company: bergen, ads: [], branches: [] },
    }
    const { fetchMock } = fakeServer(details)
    const user = userEvent.setup()
    renderDetail(fetchMock)

    const mainTab = await screen.findByRole('tab', { name: 'Hovedenhet' })
    mainTab.focus()

    await user.keyboard('{ArrowRight}')
    const osloTab = screen.getByRole('tab', { name: 'Oslo' })
    await waitFor(() => expect(document.activeElement).toBe(osloTab))
    expect(osloTab).toHaveAttribute('aria-selected', 'true')
    expect(mainTab).toHaveAttribute('tabIndex', '-1')

    await user.keyboard('{ArrowRight}')
    const bergenTab = screen.getByRole('tab', { name: 'Bergen' })
    await waitFor(() => expect(document.activeElement).toBe(bergenTab))

    // Wraps around at the end.
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(document.activeElement).toBe(mainTab))

    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(document.activeElement).toBe(bergenTab))
  })
})
