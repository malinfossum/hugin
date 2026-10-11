import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { FocusProvider, saveFocus, useFocus } from '../context/focus'
import { LanguageProvider } from '../i18n'
import { formatDate } from '../lib/dates'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../lib/types'
import { CompaniesView } from './CompaniesView'

/** CompaniesView no longer owns selection state (App/routing does) — this harness stands in
 * for that, so the existing click-through tests can drive open/close the same way a user
 * would, without each test wiring its own useState. */
function CompaniesViewHarness({ onOpenSettings = () => {} }: { onOpenSettings?: () => void }) {
  const [selectedOrgnr, setSelectedOrgnr] = useState<string | null>(null)
  return (
    <CompaniesView
      selectedOrgnr={selectedOrgnr}
      onOpenCompany={setSelectedOrgnr}
      onCloseCompany={() => setSelectedOrgnr(null)}
      onOpenSettings={onOpenSettings}
    />
  )
}

/** Test-only stand-in for "somewhere else" (Settings, or the first-run dialog) writing to the
 * shared FocusContext — proves CompaniesView reads focus live rather than mirroring it into
 * local state that would go stale once written from outside the view. */
function ExternalFocusSetter() {
  const { setFocus } = useFocus()
  return (
    <div>
      <button
        type="button"
        onClick={() => setFocus({ regions: [{ fylke: '03', kommuner: [] }], categories: [] })}
      >
        Set Oslo externally
      </button>
      <button type="button" onClick={() => setFocus({ regions: [], categories: [] })}>
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
    orgnr: '715787630',
    name: 'Acme AS',
    kommune: '0301',
    kommuneNavn: null,
    naceCode: '62.010',
    isBranch: false,
    website: 'https://acme.example',
    parentOrgnr: null,
    openAds: 0,
    ...overrides,
  }
}

function ad(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Acme AS',
    employerOrgnr: '715787630',
    kommune: '0301',
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

function renderView(fetchMock: ReturnType<typeof vi.fn>, onOpenSettings?: () => void) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FocusProvider>
          <CompaniesViewHarness onOpenSettings={onOpenSettings} />
        </FocusProvider>
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('CompaniesView', () => {
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
      company({ orgnr: '777777777', name: 'NYFJELL SPILL AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    renderView(fakeServer(companies, {}))

    expect(await screen.findByText('1 bedrift')).toBeInTheDocument()
    expect(screen.queryByText('2 bedrifter')).not.toBeInTheDocument()
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

  it('shows the group total of open ads on the row, and «Med åpen annonse» keeps only groups that have one', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', openAds: 1 }),
      company({
        orgnr: '2',
        name: 'Acme AS avd Gjøvik',
        parentOrgnr: '1',
        isBranch: true,
        openAds: 1,
      }),
      company({ orgnr: '3', name: 'Beta Software', openAds: 0 }),
      // The only open ad sits on the branch: the group still shows, counted on the main row.
      company({ orgnr: '4', name: 'Gamma AS', openAds: 0 }),
      company({
        orgnr: '5',
        name: 'Gamma AS avd Hamar',
        parentOrgnr: '4',
        isBranch: true,
        openAds: 1,
      }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    const acme = screen.getByRole('button', { name: /Acme AS/ })
    expect(within(acme).getByText('2 åpne annonser')).toHaveClass('text-muted')
    expect(
      within(screen.getByRole('button', { name: /Gamma AS/ })).getByText('1 åpen annonse')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Beta Software/ })).not.toHaveTextContent(/annonse/)

    await user.selectOptions(screen.getByLabelText('Annonser'), 'Med åpen annonse')

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.getByText('Gamma AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Annonser'), 'Alle')

    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })

  it('combines the ads filter with search, and the result line announces the count left', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', openAds: 1 }),
      company({ orgnr: '2', name: 'Acme Labs', openAds: 0 }),
      company({ orgnr: '3', name: 'Beta Software', openAds: 3 }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    const result = screen.getByRole('status')
    expect(result).toHaveTextContent(/^3 bedrifter$/)

    await user.selectOptions(screen.getByLabelText('Annonser'), 'Med åpen annonse')
    // Same element, new text: the live region existed before the change, so it is announced.
    expect(screen.getByRole('status')).toBe(result)
    expect(result).toHaveTextContent(/^2 bedrifter$/)

    await user.type(screen.getByRole('searchbox', { name: 'Søk' }), 'acme')

    expect(result).toHaveTextContent(/^1 bedrift$/)
    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.queryByText('Acme Labs')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
  })

  it('reads the ads filter and the row counts in English', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', openAds: 1 }),
      company({ orgnr: '2', name: 'Beta Software', openAds: 2 }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    const select = screen.getByLabelText('Ads')
    expect(within(select).getByRole('option', { name: 'All' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'With an open ad' })).toBeInTheDocument()
    expect(screen.getByText('1 open ad')).toBeInTheDocument()
    expect(screen.getByText('2 open ads')).toBeInTheDocument()
  })

  it('keeps the ads filter when a company is opened and closed again (regression guard)', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', openAds: 1 }),
      company({ orgnr: '2', name: 'Beta Software', openAds: 0 }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Acme AS')
    await user.selectOptions(screen.getByLabelText('Annonser'), 'Med åpen annonse')
    await user.click(screen.getByRole('button', { name: /Acme AS/ }))
    await user.click(await screen.findByRole('button', { name: 'Tilbake' }))

    const row = await screen.findByRole('button', { name: /Acme AS/ })
    await waitFor(() => expect(document.activeElement).toBe(row))
    expect(screen.getByLabelText('Annonser')).toHaveValue('open')
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
  })

  it('clicking a row fetches detail and shows Annonsehistorikk with [utgått] on inactive ads', async () => {
    const companies = [company({ orgnr: '715787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '715787630': {
        company: companies[0],
        ads: [
          ad({
            feedId: 'a1',
            title: 'Aktiv annonse',
            isActive: true,
            linkedOrgnr: null,
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
    const companies = [company({ orgnr: '1', name: 'NYFJELL SPILL AS', kommuneNavn: 'Oslo' })]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Nyfjell Spill AS')
    expect(screen.queryByText('NYFJELL SPILL AS')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Nyfjell Spill AS/ }))
    expect(await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })).toBeInTheDocument()
  })

  it('renders exactly one list row for a company with branches — branches moved into CompanyDetail', async () => {
    const companies = [
      company({ orgnr: '777777777', name: 'NYFJELL SPILL AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({ orgnr: '3', name: 'Standalone AS' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: companies[0], ads: [], branches: [companies[1]] },
    }
    const user = userEvent.setup()
    const { container } = renderView(fakeServer(companies, details))

    await screen.findByText('Nyfjell Spill AS')
    expect(screen.getByText('Standalone AS')).toBeInTheDocument()

    // One group per hovedenhet/standalone (2), not one row per unit (3) — and no branch row
    // hiding inside a nested list either.
    const outerList = container.querySelector('.companies-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    expect(outerList.children).toHaveLength(2)
    expect(
      screen.queryByText('Nyfjell Spill AS Avdeling Oslo', { exact: false })
    ).not.toBeInTheDocument()
    expect(container.querySelector('details')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Nyfjell Spill AS/ }))

    // The branch now surfaces as a tab inside the detail, not a row in the list.
    expect(await screen.findByRole('heading', { name: 'Nyfjell Spill AS' })).toBeInTheDocument()
    const tablist = screen.getByRole('tablist')
    expect(within(tablist).getByRole('tab', { name: 'Oslo' })).toBeInTheDocument()
  })

  it('does not treat a branch-of-a-branch as its own group main (guards non-two-tier chains)', async () => {
    const companies = [
      company({ orgnr: '777777777', name: 'NYFJELL SPILL AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({
        orgnr: '111222333',
        name: 'NYFJELL SPILL AS AVDELING OSLO SENTRUM',
        parentOrgnr: '787878787', // parent is itself a branch — not a valid hovedenhet
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    const { container } = renderView(fakeServer(companies, {}))

    await screen.findByText('Nyfjell Spill AS')

    // A's group (with B nested, invisible in the list) + C's standalone row — 2 groups, not 3.
    const outerList = container.querySelector('.companies-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    expect(outerList.children).toHaveLength(2)

    // C falls back to a standalone row, since its "parent" B is itself a branch.
    expect(screen.getByText('Nyfjell Spill AS Avdeling Oslo Sentrum')).toBeInTheDocument()
  })

  it('a standalone branch (parent not loaded) is tagged [branch] at top level', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    const companies = [
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777', // parent org number is not in the loaded companies list
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    renderView(fakeServer(companies, {}))

    expect(
      await screen.findByRole('button', { name: /Nyfjell Spill AS Avdeling Oslo \[branch\]/ })
    ).toBeInTheDocument()
  })

  it("groups appear at the MAIN unit's position, not a branch's earlier position in the source list", async () => {
    const companies = [
      // The branch is listed before its own hovedenhet here — a naive first-seen-position
      // grouping would surface "Nyfjell Spill AS" first (its branch is seen at index 0).
      // The fix orders by the main's own index, so "Mellomstor AS" (index 1) comes first.
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
      company({ orgnr: 'mellomstor', name: 'Mellomstor AS' }),
      company({ orgnr: '777777777', name: 'NYFJELL SPILL AS', kommuneNavn: 'Hamar' }),
    ]
    const { container } = renderView(fakeServer(companies, {}))

    await screen.findByText('Nyfjell Spill AS')

    const outerList = container.querySelector('.companies-view > ul')
    if (!outerList) throw new Error('outer companies list not found')
    const rowNames = Array.from(outerList.querySelectorAll('.companies-row strong')).map(
      (el) => el.textContent
    )
    expect(rowNames).toEqual(['Mellomstor AS', 'Nyfjell Spill AS'])
  })

  it('Tilbake from a branch tab returns to the list and refocuses the main row', async () => {
    const companies = [
      company({ orgnr: '777777777', name: 'NYFJELL SPILL AS', kommuneNavn: 'Hamar' }),
      company({
        orgnr: '787878787',
        name: 'NYFJELL SPILL AS AVDELING OSLO',
        parentOrgnr: '777777777',
        isBranch: true,
        kommuneNavn: 'Oslo',
      }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '777777777': { company: companies[0], ads: [], branches: [companies[1]] },
      '787878787': { company: companies[1], ads: [], branches: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Nyfjell Spill AS')
    const mainRow = screen.getByRole('button', { name: /Nyfjell Spill AS/ })
    await user.click(mainRow)

    const branchTab = await screen.findByRole('tab', { name: 'Oslo' })
    await user.click(branchTab)
    expect(
      await screen.findByRole('heading', { name: /Nyfjell Spill AS Avdeling Oslo/ })
    ).toBeInTheDocument()

    const back = await screen.findByRole('button', { name: 'Tilbake' })
    await user.click(back)

    const reopenedRow = await screen.findByRole('button', { name: /Nyfjell Spill AS/ })
    await waitFor(() => {
      expect(document.activeElement).toBe(reopenedRow)
    })
  })

  it('Tilbake returns to the list and focus lands back on the opening row', async () => {
    const companies = [
      company({ orgnr: '715787630', name: 'Acme AS' }),
      company({ orgnr: '999888777', name: 'Beta Software' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '715787630': { company: companies[0], ads: [], branches: [] },
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
    const companies = [company({ orgnr: '715787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '715787630': { company: companies[0], ads: [], branches: [] },
    }
    vi.stubGlobal('fetch', fakeServer(companies, details))

    render(
      <LanguageProvider>
        <LiveRegionProvider>
          <CompaniesView
            selectedOrgnr="715787630"
            onOpenCompany={vi.fn()}
            onCloseCompany={vi.fn()}
            onOpenSettings={() => {}}
          />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Søk')).not.toBeInTheDocument()
  })

  it('calls onCloseCompany (not internal state) when Tilbake is clicked', async () => {
    const companies = [company({ orgnr: '715787630', name: 'Acme AS' })]
    const details: Record<string, CompanyDetailDto> = {
      '715787630': { company: companies[0], ads: [], branches: [] },
    }
    vi.stubGlobal('fetch', fakeServer(companies, details))
    const onCloseCompany = vi.fn()
    const user = userEvent.setup()

    render(
      <LanguageProvider>
        <LiveRegionProvider>
          <CompaniesView
            selectedOrgnr="715787630"
            onOpenCompany={vi.fn()}
            onCloseCompany={onCloseCompany}
            onOpenSettings={() => {}}
          />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    const back = await screen.findByRole('button', { name: 'Tilbake' })
    await user.click(back)

    expect(onCloseCompany).toHaveBeenCalledTimes(1)
  })

  it('filters the list by the stored regions — whole fylke and narrowed fylke', async () => {
    saveFocus({ regions: [{ fylke: '34', kommuner: [] }], categories: [] })
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', name: 'Gamle AS', kommune: '3405', kommuneNavn: 'Lillehammer' }),
      company({ orgnr: '3', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    const { unmount } = renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    expect(screen.getByText('Gamle AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
    unmount()

    saveFocus({ regions: [{ fylke: '34', kommuner: ['3403'] }], categories: [] })
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    expect(screen.queryByText('Gamle AS')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
  })

  it('a company without a kommune is shown whatever the regions are (fails open)', async () => {
    saveFocus({ regions: [{ fylke: '39', kommuner: [] }], categories: [] })
    const companies = [
      company({ orgnr: '1', name: 'Ukjent AS', kommune: null, kommuneNavn: null }),
      company({ orgnr: '2', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
    ]
    renderView(fakeServer(companies, {}))

    expect(await screen.findByText('Ukjent AS')).toBeInTheDocument()
    expect(screen.queryByText('Acme AS')).not.toBeInTheDocument()
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
            <CompaniesViewHarness />
          </FocusProvider>
        </LiveRegionProvider>
      </LanguageProvider>
    )

    await screen.findByText('Acme AS')
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    // A focus change from outside this view (e.g. Settings) — the filtered list must pick
    // it up immediately, without the view being remounted.
    await user.click(screen.getByRole('button', { name: 'Set Oslo externally' }))

    expect(screen.queryByText('Acme AS')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    // A reset-style external change (clearing the region) restores the full list, same way.
    await user.click(screen.getByRole('button', { name: 'Clear region externally' }))

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })

  it('shows the display filter as read-only chips named from the loaded companies, with a link to Settings', async () => {
    saveFocus({ regions: [{ fylke: '34', kommuner: ['3403'] }], categories: [] })
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    renderView(
      fakeServer(
        [company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' })],
        {}
      ),
      onOpenSettings
    )

    await screen.findByText('Acme AS')
    expect(screen.getByText('Innlandet: Hamar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Fjern/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Fylke')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Endre i Innstillinger' }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('a null focus reads «Hele Norge» and filters nothing', async () => {
    renderView(
      fakeServer(
        [
          company({ orgnr: '1', name: 'Acme AS', kommune: '3403', kommuneNavn: 'Hamar' }),
          company({ orgnr: '2', name: 'Beta Software', kommune: '0301', kommuneNavn: 'Oslo' }),
        ],
        {}
      )
    )

    await screen.findByText('Acme AS')
    expect(screen.getByText('Hele Norge')).toBeInTheDocument()
    expect(screen.getByText('Beta Software')).toBeInTheDocument()
  })
})
