import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { LanguageProvider } from '../../i18n'
import type { AdDto, NewDto } from '../../lib/types'
import { TestQueryProvider, TestRouter } from '../../test-utils'
import { NewSinceLastVisit } from './NewSinceLastVisit'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function newDto(overrides: Partial<NewDto> = {}): NewDto {
  return {
    companies: [
      {
        orgnr: '715787630',
        name: 'Acme AS',
        kommune: '0301',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: false,
        website: null,
        parentOrgnr: null,
        openAds: 0,
      },
      {
        orgnr: '715787631',
        name: 'Acme Avdeling',
        kommune: '0301',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: true,
        website: null,
        parentOrgnr: '715787630',
        openAds: 0,
      },
      {
        orgnr: '715787632',
        name: 'Beta AS',
        kommune: '4601',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: false,
        website: null,
        parentOrgnr: null,
        openAds: 0,
      },
    ],
    ads: [
      {
        feedId: 'a1',
        title: 'Utvikler',
        employer: 'Acme AS',
        employerOrgnr: '715787630',
        kommune: '0301',
        kommuneNavn: null,
        expires: null,
        daysLeft: null,
        category: 'IT',
        sourceUrl: 'https://nav.no/stillinger/a1',
        pipelineStatus: null,
        hidden: false,
        isActive: true,
        linkedOrgnr: null,
        published: '2026-08-10T00:00:00Z',
      },
    ],
    since: '2026-08-12T00:00:00Z',
    asOf: '2026-08-19T09:30:00Z',
    ...overrides,
  }
}

function newAd(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Acme AS',
    employerOrgnr: '715787630',
    kommune: '0301',
    kommuneNavn: null,
    expires: null,
    daysLeft: null,
    category: 'IT',
    sourceUrl: 'https://nav.no/stillinger/a1',
    pipelineStatus: null,
    hidden: false,
    isActive: true,
    linkedOrgnr: null,
    published: '2026-08-10T00:00:00Z',
    ...overrides,
  }
}

/** Place headings in DOM order, as their full text: visible count plus the screen-reader suffix. */
const placeHeadingTexts = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)

/** Fake server: GET /api/new returns the given dto (or 204 when null); POST /api/seen always 204. */
function fakeServer(dto: NewDto | null) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/new' && method === 'GET') {
      return Promise.resolve(
        dto === null ? jsonResponse(undefined, { status: 204 }) : jsonResponse(dto)
      )
    }
    if (url === '/api/seen' && method === 'POST') {
      return Promise.resolve(jsonResponse(undefined, { status: 204 }))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  return fetchMock
}

function renderView(fetchMock: ReturnType<typeof vi.fn>, initialPath?: string) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <TestQueryProvider>
      <LanguageProvider>
        <LiveRegionProvider>
          <TestRouter initialPath={initialPath}>
            <NewSinceLastVisit />
          </TestRouter>
        </LiveRegionProvider>
      </LanguageProvider>
    </TestQueryProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewSinceLastVisit', () => {
  it('renders the empty-state text when no sync has ever run (204)', async () => {
    renderView(fakeServer(null))

    expect(await screen.findByText('Ingen sync er kjørt ennå. Trykk Synk nå.')).toBeInTheDocument()
  })

  it('groups new ads and companies together by kommune, ads first, branches marked', async () => {
    renderView(fakeServer(newDto()))

    const oslo = (
      await screen.findByRole('heading', { level: 3, name: '0301, 1 annonse og 2 bedrifter' })
    ).closest('div') as HTMLElement
    const items = within(oslo).getAllByRole('listitem')
    expect(items.map((item) => item.firstChild?.textContent)).toEqual([
      'Utvikler',
      'Acme AS',
      'Acme Avdeling',
    ])
    expect(within(items[0]).getByText('Ny annonse')).toBeInTheDocument()
    expect(within(items[1]).getByRole('link', { name: 'Acme AS' })).toBeInTheDocument()
    expect(within(items[2]).getByText('Avdeling')).toBeInTheDocument()

    const trondheim = screen
      .getByRole('heading', { level: 3, name: '4601, 1 bedrift' })
      .closest('div') as HTMLElement
    expect(within(trondheim).getByRole('link', { name: 'Beta AS' })).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Utvikler' })
    expect(link).toHaveAttribute('href', 'https://nav.no/stillinger/a1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('links each new company to its own detail in the same tab, the branch tag outside the name', async () => {
    renderView(fakeServer(newDto()))

    const acme = await screen.findByRole('link', { name: 'Acme AS' })
    expect(acme).toHaveAttribute('href', '/companies/715787630')
    expect(acme).not.toHaveAttribute('target')
    expect(acme).toHaveAttribute('data-return-focus', 'company:715787630')

    // A branch opens itself, not its parent.
    const branch = screen.getByRole('link', { name: 'Acme Avdeling' })
    expect(branch).toHaveAttribute('href', '/companies/715787631')
    expect(within(branch.closest('li') as HTMLElement).getByText('Avdeling')).toBeInTheDocument()
  })

  it("does not carry the dashboard's ?show= into a company link", async () => {
    renderView(fakeServer(newDto()), '/?show=all')

    expect(await screen.findByRole('link', { name: 'Beta AS' })).toHaveAttribute(
      'href',
      '/companies/715787632'
    )
  })

  it('counts each place heading once for screen readers: the visible count is aria-hidden', async () => {
    renderView(fakeServer(newDto()))

    const oslo = await screen.findByRole('heading', {
      level: 3,
      name: '0301, 1 annonse og 2 bedrifter',
    })
    expect(within(oslo).getByText('3')).toHaveAttribute('aria-hidden', 'true')
    expect(within(oslo).getByText(', 1 annonse og 2 bedrifter')).toHaveClass('sr-only')
    expect(screen.getByRole('heading', { level: 3, name: '4601, 1 bedrift' })).toBeInTheDocument()
  })

  it('folds a branch that shares its parent company name into the parent', async () => {
    const company = newDto().companies[0]
    renderView(
      fakeServer(
        newDto({
          ads: [],
          companies: [
            { ...company, orgnr: '1', name: 'GROVAN TECH' },
            { ...company, orgnr: '2', name: 'GROVAN TECH', isBranch: true, parentOrgnr: '1' },
          ],
        })
      )
    )

    const place = (
      await screen.findByRole('heading', { level: 3, name: '0301, 2 bedrifter' })
    ).closest('div') as HTMLElement
    const items = within(place).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Grovan Tech + avdeling')
  })

  it('groups new ads by place with counts, in first-seen order, and an ad without a place under «Ukjent sted»', async () => {
    const dto = newDto({
      companies: [],
      ads: [
        newAd({ feedId: 'g1', title: 'Utvikler Gjøvik', kommune: '3407', kommuneNavn: 'Gjøvik' }),
        newAd({ feedId: 'h1', title: 'Utvikler Hamar', kommune: '3403', kommuneNavn: 'Hamar' }),
        newAd({ feedId: 'g2', title: 'Tester Gjøvik', kommune: '3407', kommuneNavn: 'Gjøvik' }),
        newAd({ feedId: 'u1', title: 'Utvikler uten sted', kommune: null, kommuneNavn: null }),
      ],
    })
    renderView(fakeServer(dto))

    const gjovik = await screen.findByRole('heading', { level: 3, name: 'Gjøvik, 2 annonser' })
    expect(placeHeadingTexts()).toEqual([
      'Gjøvik 2, 2 annonser',
      'Hamar 1, 1 annonse',
      'Ukjent sted 1, 1 annonse',
    ])
    const group = gjovik.closest('div') as HTMLElement
    expect(within(group).getByRole('link', { name: 'Utvikler Gjøvik' })).toHaveAttribute(
      'href',
      'https://nav.no/stillinger/a1'
    )
    expect(within(group).getByRole('link', { name: 'Tester Gjøvik' })).toBeInTheDocument()
  })

  it('puts a company without a kommune under «Ukjent sted» too', async () => {
    const dto = newDto({
      companies: [
        {
          orgnr: '715787633',
          name: 'Stedløs AS',
          kommune: null,
          kommuneNavn: null,
          naceCode: '62.010',
          isBranch: false,
          website: null,
          parentOrgnr: null,
          openAds: 0,
        },
      ],
      ads: [],
    })
    renderView(fakeServer(dto))

    const heading = await screen.findByRole('heading', { level: 3, name: 'Ukjent sted, 1 bedrift' })
    expect(
      within(heading.closest('div') as HTMLElement).getByText('Stedløs AS')
    ).toBeInTheDocument()
  })

  it('reads the place counts in English', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    const dto = newDto({
      ads: [
        newAd({ feedId: 'o1', kommune: '0301', kommuneNavn: 'Oslo' }),
        newAd({ feedId: 'o2', kommune: '0301', kommuneNavn: 'Oslo' }),
        newAd({ feedId: 'u1', kommune: null, kommuneNavn: null }),
      ],
    })
    renderView(fakeServer(dto))

    expect(
      await screen.findByRole('heading', { level: 3, name: '0301, 2 companies' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '4601, 1 company' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Oslo, 2 ads' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Unknown place, 1 ad' })
    ).toBeInTheDocument()
  })

  it('displays all-caps Brreg company and employer names in title case', async () => {
    const dto = newDto({
      companies: [
        {
          orgnr: '715787630',
          name: 'NYFJELL SPILL AS',
          kommune: '0301',
          kommuneNavn: null,
          naceCode: '62.010',
          isBranch: false,
          website: null,
          parentOrgnr: null,
          openAds: 0,
        },
      ],
      ads: [
        {
          feedId: 'a1',
          title: 'Utvikler',
          employer: 'NYFJELL SPILL AS',
          employerOrgnr: '715787630',
          kommune: '0301',
          kommuneNavn: null,
          expires: null,
          daysLeft: null,
          category: 'IT',
          sourceUrl: null,
          pipelineStatus: null,
          hidden: false,
          isActive: true,
          linkedOrgnr: null,
          published: '2026-08-10T00:00:00Z',
        },
      ],
    })
    renderView(fakeServer(dto))

    expect(await screen.findByText('Nyfjell Spill AS')).toBeInTheDocument()
    const adRow = (await screen.findByText('Utvikler')).closest('li')
    if (!adRow) throw new Error('row not found')
    expect(adRow).toHaveTextContent('Nyfjell Spill AS')
    expect(screen.queryByText('NYFJELL SPILL AS')).not.toBeInTheDocument()
  })

  it('shows "(ingen nye)" when both lists are empty', async () => {
    renderView(fakeServer(newDto({ companies: [], ads: [] })))

    expect(await screen.findByText('(ingen nye)')).toBeInTheDocument()
  })

  it('renders a retry button on fetch failure', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    renderView(fetchMock)

    const retry = await screen.findByRole('button', { name: 'Prøv igjen' })
    expect(retry).toBeInTheDocument()
  })
})
