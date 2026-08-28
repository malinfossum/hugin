import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { formatDate } from '../dates'
import { FocusProvider, loadFocus, saveFocus, useFocus } from '../focus'
import { LanguageProvider } from '../i18n'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../types'
import { BedrifterView } from './BedrifterView'

/** BedrifterView no longer owns selection state (App/routing does) — this harness stands in
 * for that, so the existing click-through tests can drive open/close the same way a user
 * would, without each test wiring its own useState. */
function BedrifterViewHarness() {
  const [selectedOrgnr, setSelectedOrgnr] = useState<string | null>(null)
  return (
    <BedrifterView
      selectedOrgnr={selectedOrgnr}
      onOpenCompany={setSelectedOrgnr}
      onCloseCompany={() => setSelectedOrgnr(null)}
    />
  )
}

/** Test-only stand-in for "somewhere else" (Settings, or the first-run dialog) writing to the
 * shared FocusContext — proves BedrifterView reads focus live rather than mirroring it into
 * local state that would go stale once written from outside the view. */
function ExternalFocusSetter() {
  const { setFocus } = useFocus()
  return (
    <div>
      <button
        type="button"
        onClick={() => setFocus({ fylke: '03', kommune: null, categories: [] })}
      >
        Set Oslo externally
      </button>
      <button
        type="button"
        onClick={() => setFocus({ fylke: null, kommune: null, categories: [] })}
      >
        Clear region externally
      </button>
    </div>
  )
}

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function company(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return {
    orgnr: '915787630',
    name: 'Acme AS',
    kommune: '0301',
    kommuneNavn: null,
    naceCode: '62.010',
    isBranch: false,
    website: 'https://acme.example',
    parentOrgnr: null,
    ...overrides,
  }
}

function ad(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Acme AS',
    employerOrgnr: '915787630',
    kommune: '0301',
    expires: '2026-08-25T00:00:00Z',
    daysLeft: null,
    category: 'IT',
    sourceUrl: 'https://nav.no/stillinger/a1',
    pipelineStatus: null,
    hidden: false,
    isActive: true,
    published: '2026-08-12T00:00:00Z',
    ...overrides,
  }
}

/** Fake server: GET /api/companies; GET /api/companies/{orgnr} -> detail or 404. */
function fakeServer(companies: CompanyDto[], details: Record<string, CompanyDetailDto>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/companies') {
      return Promise.resolve(jsonResponse(companies))
    }
    const detailMatch = url.match(/^\/api\/companies\/(.+)$/)
    if (detailMatch) {
      const detail = details[detailMatch[1]]
      if (!detail) {
        return Promise.resolve(
          jsonResponse({ title: `Fant ikke orgnr ${detailMatch[1]}.` }, { status: 404 })
        )
      }
      return Promise.resolve(jsonResponse(detail))
    }
    return Promise.reject(new Error(`unhandled request ${url}`))
  })
  return fetchMock
}

function renderView(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FocusProvider>
          <BedrifterViewHarness />
        </FocusProvider>
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('BedrifterView', () => {
  it('filters by name search case-insensitively (substring)', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS' }),
      company({ orgnr: '2', name: 'Beta Software' }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    const search = screen.getByRole('searchbox', { name: 'Søk' })
    await userEvent.setup().type(search, 'ac')

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
    expect(screen.getByText('1 bedrift')).toBeInTheDocument()
  })

  it('shows the singular count for a single loaded company with no filters applied', async () => {
    const companies = [company({ orgnr: '1', name: 'Acme AS' })]
    renderView(fakeServer(companies, {}))

    expect(await screen.findByText('1 bedrift')).toBeInTheDocument()
  })

  it('counts rendered rows, not raw units — a branch+parent pair (2 units, 1 row) is singular', async () => {
    const companies = [
      company({ orgnr: '925836613', name: 'NORSK TIPPING AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    renderView(fakeServer(companies, {}))

    expect(await screen.findByText('1 bedrift')).toBeInTheDocument()
    expect(screen.queryByText('2 bedrifter')).not.toBeInTheDocument()
  })

  it('filters by kommune select', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '0301' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '4601' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Kommune'), '4601')

    expect(screen.queryByText('Acme AS')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })

  it('offers a Fylke select with options derived from loaded companies', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    const fylke = screen.getByLabelText('Fylke')
    const optionLabels = within(fylke)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(optionLabels).toEqual(['Alle', 'Innlandet', 'Oslo'])
  })

  it('choosing a fylke hides companies outside it and narrows the kommune options', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Gamle AS', kommune: '3405', kommuneNavn: 'Lillehammer' }),
      company({ orgnr: '3', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.getByText('Gamle AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()

    const kommuneOptions = within(screen.getByLabelText('Kommune'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(kommuneOptions).toEqual(['Alle', 'Hamar', 'Lillehammer'])
  })

  it('switching fylke resets an incompatible kommune filter', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.selectOptions(screen.getByLabelText('Kommune'), '3403')

    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Fylke'), 'Oslo')

    expect(screen.getByText('Beta Software')).toBeInTheDocument()
    expect((screen.getByLabelText('Kommune') as HTMLSelectElement).value).toBe('')
  })

  it('filters by website select: All shows both, Has website only companies with a website, No website only those without', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', website: 'https://acme.example' }),
      company({ orgnr: '2', name: 'Beta Software', website: null }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    const websiteFilter = screen.getByLabelText('Nettside')
    await user.selectOptions(websiteFilter, 'Har nettside')

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()

    await user.selectOptions(websiteFilter, 'Uten nettside')

    expect(screen.queryByText('Acme AS')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    await user.selectOptions(websiteFilter, 'Alle')

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })

  it('clicking a row fetches detail and shows Annonsehistorikk with [utgått] on inactive ads', async () => {
    const companies = [company({ orgnr: '915787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '915787630': {
        company: companies[0],
        ads: [
          ad({
            feedId: 'a1',
            title: 'Aktiv annonse',
            isActive: true,
            published: '2026-08-01T00:00:00Z',
          }),
          ad({ feedId: 'a2', title: 'Utgått annonse', isActive: false, published: null }),
        ],
        branches: [],
      },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: /Acme AS/ }))

    expect(await screen.findByRole('heading', { name: 'Annonsehistorikk' })).toBeInTheDocument()
    const activeRow = screen.getByText('Aktiv annonse').closest('li')
    const expiredRow = screen.getByText('Utgått annonse').closest('li')
    if (!activeRow || !expiredRow) throw new Error('row not found')
    expect(within(activeRow).queryByText('[utgått]')).not.toBeInTheDocument()
    expect(within(expiredRow).getByText('[utgått]')).toBeInTheDocument()
    const expectedPublished = formatDate('2026-08-01T00:00:00Z')
    expect(within(activeRow).getByText(`publisert ${expectedPublished}`)).toBeInTheDocument()
    expect(within(expiredRow).queryByText(/publisert/)).not.toBeInTheDocument()
  })

  it('list rows no longer show website links or the no-website note', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', website: 'https://acme.example' }),
      company({ orgnr: '2', name: 'Uten Nettside AS', website: null }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await screen.findByText('Uten Nettside AS')

    expect(screen.queryByRole('link', { name: 'https://acme.example' })).not.toBeInTheDocument()
    expect(screen.queryByText(/har ikke egen nettside/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Google-søk' })).not.toBeInTheDocument()
  })

  it('CompanyDetail shows a Nettside row with the website link when present', async () => {
    const companies = [company({ orgnr: '1', name: 'Acme AS', website: 'https://acme.example' })]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: /Acme AS/ }))

    await screen.findByRole('heading', { name: 'Acme AS' })
    expect(screen.getByText('Nettside')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'https://acme.example' })
    expect(link).toHaveAttribute('href', 'https://acme.example')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('CompanyDetail shows the missing-website note and a Google fallback link when there is no website — no Proff anywhere', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Uten Nettside AS', website: null, kommuneNavn: 'Oslo' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Uten Nettside AS')
    await user.click(screen.getByRole('button', { name: /Uten Nettside AS/ }))

    await screen.findByRole('heading', { name: 'Uten Nettside AS' })
    expect(screen.getByText(/har ikke egen nettside/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Google-søk' })).toHaveAttribute(
      'href',
      `https://www.google.com/search?q=${encodeURIComponent('"Uten Nettside AS" Oslo')}`
    )
    expect(screen.queryByText(/proff/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /proff/i })).not.toBeInTheDocument()
  })

  it('displays an all-caps Brreg name in title case, in the row and the detail heading', async () => {
    const companies = [company({ orgnr: '1', name: 'NORSK TIPPING AS', kommuneNavn: 'Oslo' })]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Norsk Tipping AS')
    expect(screen.queryByText('NORSK TIPPING AS')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Norsk Tipping AS/ }))
    expect(await screen.findByRole('heading', { name: 'Norsk Tipping AS' })).toBeInTheDocument()
  })

  it('renders exactly one list row for a company with branches — branches moved into CompanyDetail', async () => {
    const companies = [
      company({ orgnr: '925836613', name: 'NORSK TIPPING AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({ orgnr: '3', name: 'Standalone AS' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '925836613': { company: companies[0], ads: [], branches: [companies[1]] },
    }
    const user = userEvent.setup()
    const { container } = renderView(fakeServer(companies, details))

    await screen.findByText('Norsk Tipping AS')
    expect(screen.getByText('Standalone AS')).toBeInTheDocument()

    // One group per hovedenhet/standalone (2), not one row per unit (3) — and no branch row
    // hiding inside a nested list either.
    const outerList = container.querySelector('.bedrifter-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    expect(outerList.children).toHaveLength(2)
    expect(
      screen.queryByText('Norsk Tipping AS Avdeling Oslo', { exact: false })
    ).not.toBeInTheDocument()
    expect(container.querySelector('details')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Norsk Tipping AS/ }))

    // The branch now surfaces as a tab inside the detail, not a row in the list.
    expect(await screen.findByRole('heading', { name: 'Norsk Tipping AS' })).toBeInTheDocument()
    const tablist = screen.getByRole('tablist')
    expect(within(tablist).getByRole('tab', { name: 'Oslo' })).toBeInTheDocument()
  })

  it('does not treat a branch-of-a-branch as its own group main (guards non-two-tier chains)', async () => {
    const companies = [
      company({ orgnr: '925836613', name: 'NORSK TIPPING AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({
        orgnr: '111222333',
        name: 'NORSK TIPPING AS AVDELING OSLO SENTRUM',
        parentOrgnr: '972483672', // parent is itself a branch — not a valid hovedenhet
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    const { container } = renderView(fakeServer(companies, {}))

    await screen.findByText('Norsk Tipping AS')

    // A's group (with B nested, invisible in the list) + C's standalone row — 2 groups, not 3.
    const outerList = container.querySelector('.bedrifter-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    expect(outerList.children).toHaveLength(2)

    // C falls back to a standalone row, since its "parent" B is itself a branch.
    expect(screen.getByText('Norsk Tipping AS Avdeling Oslo Sentrum')).toBeInTheDocument()
  })

  it('a standalone branch (parent not loaded) is tagged [branch] at top level', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    const companies = [
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613', // parent org number is not in the loaded companies list
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    renderView(fakeServer(companies, {}))

    expect(
      await screen.findByRole('button', { name: /Norsk Tipping AS Avdeling Oslo \[branch\]/ })
    ).toBeInTheDocument()
  })

  it("groups appear at the MAIN unit's position, not a branch's earlier position in the source list", async () => {
    const companies = [
      // The branch is listed before its own hovedenhet here — a naive first-seen-position
      // grouping would surface "Norsk Tipping AS" first (its branch is seen at index 0).
      // The fix orders by the main's own index, so "Mellomstor AS" (index 1) comes first.
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({ orgnr: 'mellomstor', name: 'Mellomstor AS' }),
      company({ orgnr: '925836613', name: 'NORSK TIPPING AS', kommuneNavn: 'Hamar' }),
    ]
    const { container } = renderView(fakeServer(companies, {}))

    await screen.findByText('Norsk Tipping AS')

    const outerList = container.querySelector('.bedrifter-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    const rowNames = Array.from(outerList.querySelectorAll('.bedrifter-row strong')).map(
      (el) => el.textContent
    )
    expect(rowNames).toEqual(['Mellomstor AS', 'Norsk Tipping AS'])
  })

  it('Tilbake from a branch tab returns to the list and refocuses the main row', async () => {
    const companies = [
      company({ orgnr: '925836613', name: 'NORSK TIPPING AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '972483672',
        name: 'NORSK TIPPING AS AVDELING OSLO',
        parentOrgnr: '925836613',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '925836613': { company: companies[0], ads: [], branches: [companies[1]] },
      '972483672': { company: companies[1], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Norsk Tipping AS')
    const mainRow = screen.getByRole('button', { name: /Norsk Tipping AS/ })
    await user.click(mainRow)

    const branchTab = await screen.findByRole('tab', { name: 'Oslo' })
    await user.click(branchTab)
    expect(
      await screen.findByRole('heading', { name: /Norsk Tipping AS Avdeling Oslo/ })
    ).toBeInTheDocument()

    const back = await screen.findByRole('button', { name: 'Tilbake' })
    await user.click(back)

    const reopenedRow = await screen.findByRole('button', { name: /Norsk Tipping AS/ })
    await waitFor(() => {
      expect(document.activeElement).toBe(reopenedRow)
    })
  })

  it('Tilbake returns to the list and focus lands back on the opening row', async () => {
    const companies = [
      company({ orgnr: '915787630', name: 'Acme AS' }),
      company({ orgnr: '999888777', name: 'Beta Software' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '915787630': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Acme AS')
    const row = screen.getByRole('button', { name: /Acme AS/ })
    await user.click(row)

    const back = await screen.findByRole('button', { name: 'Tilbake' })
    await user.click(back)

    const reopenedRow = await screen.findByRole('button', { name: /Acme AS/ })
    await waitFor(() => {
      expect(document.activeElement).toBe(reopenedRow)
    })
  })

  it('deep-links straight into a detail when selectedOrgnr is set on mount (route-driven, no click)', async () => {
    const companies = [company({ orgnr: '915787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '915787630': { company: companies[0], ads: [], branches: [] },
    }
    vi.stubGlobal('fetch', fakeServer(companies, details))

    render(
      <LanguageProvider>
        <LiveRegionProvider>
          <BedrifterView
            selectedOrgnr="915787630"
            onOpenCompany={vi.fn()}
            onCloseCompany={vi.fn()}
          />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Søk')).not.toBeInTheDocument()
  })

  it('calls onCloseCompany (not internal state) when Tilbake is clicked', async () => {
    const companies = [company({ orgnr: '915787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '915787630': { company: companies[0], ads: [], branches: [] },
    }
    vi.stubGlobal('fetch', fakeServer(companies, details))
    const onCloseCompany = vi.fn()
    const user = userEvent.setup()

    render(
      <LanguageProvider>
        <LiveRegionProvider>
          <BedrifterView
            selectedOrgnr="915787630"
            onOpenCompany={vi.fn()}
            onCloseCompany={onCloseCompany}
          />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    const back = await screen.findByRole('button', { name: 'Tilbake' })
    await user.click(back)

    expect(onCloseCompany).toHaveBeenCalledTimes(1)
  })

  it('initializes the fylke select from a stored focus', async () => {
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    expect((screen.getByLabelText('Fylke') as HTMLSelectElement).value).toBe('34')
    // Fylke filter is applied from the seeded focus straight away.
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
  })

  it('changing the kommune select writes the choice back to stored focus', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '0301', kommuneNavn: 'Oslo' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '3403', kommuneNavn: 'Hamar' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.selectOptions(screen.getByLabelText('Kommune'), '3403')

    expect(loadFocus()).toEqual({ fylke: '34', kommune: '3403', categories: [] })
  })

  it('write-back happens even when no focus was stored yet (a manual choice is an answer)', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    expect(loadFocus()).toBeNull()
    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')

    expect(loadFocus()).toEqual({ fylke: '34', kommune: null, categories: [] })
  })

  it('a region write-back preserves existing categories from focus', async () => {
    saveFocus({ fylke: null, kommune: null, categories: ['Utvikling'] })
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')

    expect(loadFocus()).toEqual({ fylke: '34', kommune: null, categories: ['Utvikling'] })
  })

  it('reacts live to a focus change made outside the view — context is the single reactive owner', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    const user = userEvent.setup()
    vi.stubGlobal('fetch', fakeServer(companies, {}))
    render(
      <LanguageProvider>
        <LiveRegionProvider>
          <FocusProvider>
            <ExternalFocusSetter />
            <BedrifterViewHarness />
          </FocusProvider>
        </LiveRegionProvider>
      </LanguageProvider>
    )

    await screen.findByText('Acme AS')
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    // A focus change from outside this view (e.g. Settings) — the select and the filtered
    // list must pick it up immediately, without the view being remounted.
    await user.click(screen.getByRole('button', { name: 'Set Oslo externally' }))

    expect((screen.getByLabelText('Fylke') as HTMLSelectElement).value).toBe('03')
    expect(screen.queryByText('Acme AS')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    // A reset-style external change (clearing the region) restores the full list, same way.
    await user.click(screen.getByRole('button', { name: 'Clear region externally' }))

    expect((screen.getByLabelText('Fylke') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })
})
