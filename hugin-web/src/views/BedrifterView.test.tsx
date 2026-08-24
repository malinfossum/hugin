import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { formatDate } from '../dates'
import { LanguageProvider } from '../i18n'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../types'
import { BedrifterView } from './BedrifterView'

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
        <BedrifterView />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
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
    expect(screen.getByText('1 bedrifter')).toBeInTheDocument()
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

  it('filters to companies with a website when the has-website checkbox is checked', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Acme AS', website: 'https://acme.example' }),
      company({ orgnr: '2', name: 'Beta Software', website: null }),
    ]
    const user = userEvent.setup()
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')
    expect(screen.getByText('Beta Software')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Har egen nettside' }))

    expect(screen.getByText('Acme AS')).toBeInTheDocument()
    expect(screen.queryByText('Beta Software')).not.toBeInTheDocument()
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

  it('a company with a website shows the plain website link, unchanged', async () => {
    const companies = [company({ orgnr: '1', name: 'Acme AS', website: 'https://acme.example' })]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Acme AS')

    const link = screen.getByRole('link', { name: 'https://acme.example' })
    expect(link).toHaveAttribute('href', 'https://acme.example')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.queryByText(/har ikke egen nettside/)).not.toBeInTheDocument()
  })

  it('a company without a website shows the fallback note and correctly-encoded Google/Proff links', async () => {
    const companies = [
      company({
        orgnr: '1',
        name: 'Uten Nettside AS',
        website: null,
        kommune: '0301',
        kommuneNavn: 'Oslo',
      }),
    ]
    renderView(fakeServer(companies, {}))

    await screen.findByText('Uten Nettside AS')

    expect(screen.getByText(/har ikke egen nettside/)).toBeInTheDocument()

    const google = screen.getByRole('link', { name: 'Google-søk' })
    expect(google).toHaveAttribute(
      'href',
      `https://www.google.com/search?q=${encodeURIComponent('"Uten Nettside AS" Oslo')}`
    )
    expect(google).toHaveAttribute('target', '_blank')
    expect(google).toHaveAttribute('rel', 'noopener noreferrer')

    const proff = screen.getByRole('link', { name: 'Proff.no' })
    expect(proff).toHaveAttribute(
      'href',
      `https://www.proff.no/search?q=${encodeURIComponent('Uten Nettside AS')}`
    )
    expect(proff).toHaveAttribute('target', '_blank')
    expect(proff).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('CompanyDetail shows the fallback links when the selected company has no website', async () => {
    const companies = [
      company({ orgnr: '1', name: 'Uten Nettside AS', website: null, kommuneNavn: 'Oslo' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [] },
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
    expect(screen.getByRole('link', { name: 'Proff.no' })).toHaveAttribute(
      'href',
      `https://www.proff.no/search?q=${encodeURIComponent('Uten Nettside AS')}`
    )
  })

  it('displays an all-caps Brreg name in title case, in the row and the detail heading', async () => {
    const companies = [company({ orgnr: '1', name: 'NORSK TIPPING AS', kommuneNavn: 'Oslo' })]
    const details: Record<string, CompanyDetailDto> = {
      '1': { company: companies[0], ads: [] },
    }
    const user = userEvent.setup()
    renderView(fakeServer(companies, details))

    await screen.findByText('Norsk Tipping AS')
    expect(screen.queryByText('NORSK TIPPING AS')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Norsk Tipping AS/ }))
    expect(await screen.findByRole('heading', { name: 'Norsk Tipping AS' })).toBeInTheDocument()
  })

  it('Tilbake returns to the list and focus lands back on the opening row', async () => {
    const companies = [
      company({ orgnr: '915787630', name: 'Acme AS' }),
      company({ orgnr: '999888777', name: 'Beta Software' }),
    ]
    const details: Record<string, CompanyDetailDto> = {
      '915787630': { company: companies[0], ads: [] },
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
})
