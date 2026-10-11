import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { LanguageProvider } from '../../i18n'
import type { AdDto, NewDto } from '../../lib/types'
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
  screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)

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

function renderView(fetchMock: ReturnType<typeof vi.fn>, refreshKey = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <NewSinceLastVisit refreshKey={refreshKey} />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewSinceLastVisit', () => {
  it('renders the empty-state text when no sync has ever run (204)', async () => {
    renderView(fakeServer(null))

    expect(await screen.findByText('Ingen sync er kjørt ennå — trykk Synk nå.')).toBeInTheDocument()
  })

  it('renders grouped companies (by kommune, [avdeling] for branches) and ads with counts', async () => {
    renderView(fakeServer(newDto()))

    expect(await screen.findByRole('heading', { name: 'Nye bedrifter (3)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nye annonser (1)' })).toBeInTheDocument()

    const oslo = screen
      .getByRole('heading', { level: 4, name: '0301, 2 bedrifter' })
      .closest('div') as HTMLElement
    expect(within(oslo).getByText('Acme AS')).toBeInTheDocument()
    expect(within(oslo).getByText(/Acme Avdeling.*\[avdeling\]/)).toBeInTheDocument()

    const trondheim = screen
      .getByRole('heading', { level: 4, name: '4601, 1 bedrift' })
      .closest('div') as HTMLElement
    expect(within(trondheim).getByText('Beta AS')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Utvikler' })
    expect(link).toHaveAttribute('href', 'https://nav.no/stillinger/a1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('counts each place heading once for screen readers: the visible count is aria-hidden', async () => {
    renderView(fakeServer(newDto()))

    const oslo = await screen.findByRole('heading', { level: 4, name: '0301, 2 bedrifter' })
    expect(within(oslo).getByText('· 2')).toHaveAttribute('aria-hidden', 'true')
    expect(within(oslo).getByText(', 2 bedrifter')).toHaveClass('visually-hidden')
    expect(screen.getByRole('heading', { level: 4, name: '4601, 1 bedrift' })).toBeInTheDocument()
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

    const gjovik = await screen.findByRole('heading', { level: 4, name: 'Gjøvik, 2 annonser' })
    expect(placeHeadingTexts()).toEqual([
      'Gjøvik · 2, 2 annonser',
      'Hamar · 1, 1 annonse',
      'Ukjent sted · 1, 1 annonse',
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

    const heading = await screen.findByRole('heading', { level: 4, name: 'Ukjent sted, 1 bedrift' })
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
      await screen.findByRole('heading', { level: 4, name: '0301, 2 companies' })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: '4601, 1 company' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Oslo, 2 ads' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 4, name: 'Unknown place, 1 ad' })
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

  it('POSTs the exact asOf string from the fetched NewDto when the dialog is confirmed', async () => {
    const user = userEvent.setup()
    const dto = newDto({ asOf: '2026-08-19T09:30:00Z' })
    const fetchMock = fakeServer(dto)
    renderView(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Merk som sett' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seen',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ asOf: '2026-08-19T09:30:00Z' }),
        })
      )
    })
  })

  it('POSTs nothing when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer(newDto())
    renderView(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

    expect(fetchMock.mock.calls.some(([u]) => u === '/api/seen')).toBe(false)
  })

  it('announces "Merket som sett." and moves focus to the section heading after confirming', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer(newDto())
    renderView(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Merk som sett' }))

    const heading = screen.getByRole('heading', { name: 'Nytt siden sist' })
    await waitFor(() => {
      expect(document.activeElement).toBe(heading)
    })

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Merket som sett.')
    })
  })

  it('hides the "Merk som sett" button and shows "(ingen nye)" when both lists are empty', async () => {
    renderView(fakeServer(newDto({ companies: [], ads: [] })))

    expect(await screen.findByText('(ingen nye)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Merk som sett' })).not.toBeInTheDocument()
  })

  it('renders a retry button on fetch failure', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    renderView(fetchMock)

    const retry = await screen.findByRole('button', { name: 'Prøv igjen' })
    expect(retry).toBeInTheDocument()
  })

  it('renders the new-companies and new-ads subsections inside distinct panel wrappers', async () => {
    renderView(fakeServer(newDto()))

    const companiesHeading = await screen.findByRole('heading', { name: 'Nye bedrifter (3)' })
    const adsHeading = screen.getByRole('heading', { name: 'Nye annonser (1)' })

    const companiesPanel = companiesHeading.closest('.panel')
    const adsPanel = adsHeading.closest('.panel')
    expect(companiesPanel).toBeInTheDocument()
    expect(adsPanel).toBeInTheDocument()
    expect(companiesPanel).not.toBe(adsPanel)
  })

  it('posts the asOf shown when the dialog opened, not a newer asOf from a refetch while it was still open (regression)', async () => {
    const user = userEvent.setup()
    let currentDto = newDto({ asOf: '2026-08-19T09:30:00Z' })
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === '/api/new' && method === 'GET') {
        return Promise.resolve(jsonResponse(currentDto))
      }
      if (url === '/api/seen' && method === 'POST') {
        return Promise.resolve(jsonResponse(undefined, { status: 204 }))
      }
      return Promise.reject(new Error(`unhandled request ${method} ${url}`))
    })

    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(
      <LanguageProvider>
        <LiveRegionProvider>
          <NewSinceLastVisit refreshKey={0} />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    await screen.findByRole('dialog')

    // A sync completes while the dialog is still open: /api/new now has a newer asOf
    // (and different content — one more ad), and DashboardView would bump refreshKey to
    // trigger this refetch.
    currentDto = newDto({
      asOf: '2026-08-19T10:15:00Z',
      ads: [
        ...newDto().ads,
        {
          feedId: 'a2',
          title: 'Ny annonse fra runde to',
          employer: 'Beta AS',
          employerOrgnr: '715787632',
          kommune: '4601',
          kommuneNavn: null,
          expires: null,
          daysLeft: null,
          category: 'IT',
          sourceUrl: null,
          pipelineStatus: null,
          hidden: false,
          isActive: true,
          linkedOrgnr: null,
          published: '2026-08-19T09:00:00Z',
        },
      ],
    })
    rerender(
      <LanguageProvider>
        <LiveRegionProvider>
          <NewSinceLastVisit refreshKey={1} />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    // Wait for content that only exists in response B — proves the refetch actually
    // applied, rather than relying on userEvent timing or a fetch-call count.
    await screen.findByText('Ny annonse fra runde to')

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Merk som sett' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/seen',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ asOf: '2026-08-19T09:30:00Z' }),
        })
      )
    })
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) =>
          u === '/api/seen' &&
          (i as RequestInit)?.body === JSON.stringify({ asOf: '2026-08-19T10:15:00Z' })
      )
    ).toBe(false)
  })
})
