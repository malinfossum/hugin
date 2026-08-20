import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import type { NewDto } from '../../types'
import { NyttSidenSist } from './NyttSidenSist'

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
        orgnr: '915787630',
        name: 'Acme AS',
        kommune: '0301',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: false,
        website: null,
        parentOrgnr: null,
      },
      {
        orgnr: '915787631',
        name: 'Acme Avdeling',
        kommune: '0301',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: true,
        website: null,
        parentOrgnr: '915787630',
      },
      {
        orgnr: '915787632',
        name: 'Beta AS',
        kommune: '4601',
        kommuneNavn: null,
        naceCode: '62.010',
        isBranch: false,
        website: null,
        parentOrgnr: null,
      },
    ],
    ads: [
      {
        feedId: 'a1',
        title: 'Utvikler',
        employer: 'Acme AS',
        employerOrgnr: '915787630',
        kommune: '0301',
        expires: null,
        daysLeft: null,
        category: 'IT',
        sourceUrl: 'https://nav.no/stillinger/a1',
        pipelineStatus: null,
        hidden: false,
        isActive: true,
        published: '2026-08-10T00:00:00Z',
      },
    ],
    since: '2026-08-12T00:00:00Z',
    asOf: '2026-08-19T09:30:00Z',
    ...overrides,
  }
}

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
    <LiveRegionProvider>
      <NyttSidenSist refreshKey={refreshKey} />
    </LiveRegionProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NyttSidenSist', () => {
  it('renders the empty-state text when no sync has ever run (204)', async () => {
    renderView(fakeServer(null))

    expect(await screen.findByText('Ingen sync er kjørt ennå — trykk Synk nå.')).toBeInTheDocument()
  })

  it('renders grouped companies (by kommune, [avdeling] for branches) and ads with counts', async () => {
    renderView(fakeServer(newDto()))

    expect(await screen.findByRole('heading', { name: 'Nye bedrifter (3)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nye annonser (1)' })).toBeInTheDocument()

    const oslo = screen.getByText('0301').closest('div') as HTMLElement
    expect(within(oslo).getByText('Acme AS')).toBeInTheDocument()
    expect(within(oslo).getByText(/Acme Avdeling.*\[avdeling\]/)).toBeInTheDocument()

    const trondheim = screen.getByText('4601').closest('div') as HTMLElement
    expect(within(trondheim).getByText('Beta AS')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Utvikler' })
    expect(link).toHaveAttribute('href', 'https://nav.no/stillinger/a1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
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
      <LiveRegionProvider>
        <NyttSidenSist refreshKey={0} />
      </LiveRegionProvider>
    )

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    await screen.findByRole('dialog')

    // A sync completes while the dialog is still open: /api/new now has a newer asOf,
    // and DashboardView would bump refreshKey to trigger this refetch.
    currentDto = newDto({ asOf: '2026-08-19T10:15:00Z' })
    const getCallCountBefore = fetchMock.mock.calls.filter(
      ([u, i]) => u === '/api/new' && (i?.method ?? 'GET') === 'GET'
    ).length
    rerender(
      <LiveRegionProvider>
        <NyttSidenSist refreshKey={1} />
      </LiveRegionProvider>
    )

    await waitFor(() => {
      const getCallCountAfter = fetchMock.mock.calls.filter(
        ([u, i]) => u === '/api/new' && (i?.method ?? 'GET') === 'GET'
      ).length
      expect(getCallCountAfter).toBeGreaterThan(getCallCountBefore)
    })

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
