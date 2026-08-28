import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { LanguageProvider } from '../../i18n'
import type { AdDto } from '../../types'
import { FristerList } from './FristerList'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function ad(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Acme AS',
    employerOrgnr: '915787630',
    kommune: '0301',
    expires: '2026-08-25T00:00:00Z',
    daysLeft: 6,
    category: 'IT',
    sourceUrl: 'https://nav.no/stillinger/a1',
    pipelineStatus: null,
    hidden: false,
    isActive: true,
    published: '2026-08-10T00:00:00Z',
    ...overrides,
  }
}

/** Fake server: GET /api/ads (non-hidden only) / ?hidden=true (all, flagged); POST/DELETE hide flip the Hidden flag in place. */
function fakeServer(seed: AdDto[]) {
  const ads = seed.map((a) => ({ ...a }))
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/ads' && method === 'GET') {
      return Promise.resolve(jsonResponse(ads.filter((a) => !a.hidden)))
    }
    if (url === '/api/ads?hidden=true' && method === 'GET') {
      return Promise.resolve(jsonResponse(ads))
    }
    const hideMatch = url.match(/^\/api\/ads\/(.+)\/hide$/)
    if (hideMatch && (method === 'POST' || method === 'DELETE')) {
      const target = ads.find((a) => a.feedId === hideMatch[1])
      if (target) target.hidden = method === 'POST'
      return Promise.resolve(jsonResponse(undefined, { status: 204 }))
    }
    const pipelineMatch = url.match(/^\/api\/pipeline\/(.+)$/)
    if (pipelineMatch && method === 'PUT') {
      const target = ads.find((a) => a.employerOrgnr === pipelineMatch[1])
      if (target) target.pipelineStatus = 'active'
      return Promise.resolve(jsonResponse(undefined, { status: 204 }))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  return fetchMock
}

function renderList(fetchMock: ReturnType<typeof vi.fn>, refreshKey = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FristerList refreshKey={refreshKey} />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FristerList', () => {
  it('renders rows in API order and shows "ingen frist" for a null-expires row', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Første', daysLeft: 2, expires: '2026-08-21T00:00:00Z' }),
      ad({ feedId: 'a2', title: 'Andre', daysLeft: 5, expires: '2026-08-24T00:00:00Z' }),
      ad({ feedId: 'a3', title: 'Tredje', daysLeft: null, expires: null }),
    ]
    renderList(fakeServer(ads))

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('Første')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Andre')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Tredje')).toBeInTheDocument()
    expect(within(rows[2]).getByText('ingen frist')).toBeInTheDocument()
  })

  it('applies urgency classes and always prints the number', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Rød', daysLeft: 2 }),
      ad({ feedId: 'a2', title: 'Gul', daysLeft: 5 }),
      ad({ feedId: 'a3', title: 'Ingen', daysLeft: 12 }),
    ]
    renderList(fakeServer(ads))

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('2 dager')).toHaveClass('frist-rod')
    expect(within(rows[1]).getByText('5 dager')).toHaveClass('frist-gul')
    const ingenSpan = within(rows[2]).getByText('12 dager')
    expect(ingenSpan).not.toHaveClass('frist-rod')
    expect(ingenSpan).not.toHaveClass('frist-gul')
  })

  it('renders the singular day badge for daysLeft === 1', async () => {
    const ads = [ad({ feedId: 'a1', title: 'I morgen', daysLeft: 1 })]
    renderList(fakeServer(ads))

    await screen.findByText('1 dag')
    expect(screen.queryByText('1 dager')).toBeNull()
  })

  it('shows "utløpt" with frist-rod for an overdue (negative daysLeft) row', async () => {
    const ads = [ad({ feedId: 'a1', title: 'Forfalt', daysLeft: -2 })]
    renderList(fakeServer(ads))

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('utløpt')).toHaveClass('frist-rod')
  })

  it('shows "i dag" with frist-rod for a due-today (daysLeft 0) row', async () => {
    const ads = [ad({ feedId: 'a1', title: 'I dag', daysLeft: 0 })]
    renderList(fakeServer(ads))

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('i dag')).toHaveClass('frist-rod')
  })

  it('hides a row on Skjul, POSTs the hide endpoint, moves focus to the next row and announces', async () => {
    const user = userEvent.setup()
    const ads = [
      ad({ feedId: 'a1', title: 'Første' }),
      ad({ feedId: 'a2', title: 'Andre' }),
      ad({ feedId: 'a3', title: 'Tredje' }),
    ]
    const fetchMock = fakeServer(ads)
    renderList(fetchMock)

    await screen.findAllByRole('listitem')
    const firstRow = screen.getByText('Første').closest('li')
    if (!firstRow) throw new Error('row not found')
    await user.click(within(firstRow).getByRole('button', { name: 'Skjul' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ads/a1/hide',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('Første')).not.toBeInTheDocument()
    })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const nextSkjulButton = within(rows[0]).getByRole('button', { name: 'Skjul' })
    expect(document.activeElement).toBe(nextSkjulButton)

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Annonsen er skjult.')
    })
  })

  it('moves focus to the list heading when hiding the last remaining row', async () => {
    const user = userEvent.setup()
    const ads = [ad({ feedId: 'a1', title: 'Eneste' })]
    renderList(fakeServer(ads))

    await screen.findAllByRole('listitem')
    await user.click(screen.getByRole('button', { name: 'Skjul' }))

    await waitFor(() => {
      expect(screen.queryByText('Eneste')).not.toBeInTheDocument()
    })

    const heading = screen.getByRole('heading', { name: 'Frister' })
    expect(document.activeElement).toBe(heading)
  })

  it('defaults the "Vis" select to "Aktive frister" and refetches with hidden=true when "Også skjulte" is chosen, showing Angre skjul', async () => {
    const user = userEvent.setup()
    const ads = [
      ad({ feedId: 'a1', title: 'Synlig', hidden: false }),
      ad({ feedId: 'a2', title: 'Skjult', hidden: true }),
    ]
    const fetchMock = fakeServer(ads)
    renderList(fetchMock)

    await screen.findAllByRole('listitem')
    expect(screen.getByLabelText('Vis')).toHaveValue('active')
    expect(screen.queryByText('Skjult')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Vis'), 'Også skjulte')

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/ads?hidden=true')).toBe(true)
    })

    const skjultRow = await screen.findByText('Skjult')
    const li = skjultRow.closest('li')
    if (!li) throw new Error('row not found')
    expect(within(li).getByRole('button', { name: 'Angre skjul' })).toBeInTheDocument()
  })

  it('renders a retry button on fetch failure', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    renderList(fetchMock)

    const retry = await screen.findByRole('button', { name: 'Prøv igjen' })
    expect(retry).toBeInTheDocument()
  })

  it('tracks a company on Følg opp, PUTs the pipeline endpoint and announces', async () => {
    const user = userEvent.setup()
    const ads = [
      ad({
        feedId: 'a1',
        title: 'Utvikler',
        employer: 'Norsk Tipping AS',
        employerOrgnr: '972483672',
        pipelineStatus: null,
      }),
    ]
    const fetchMock = fakeServer(ads)
    renderList(fetchMock)

    await screen.findAllByRole('listitem')
    await user.click(screen.getByRole('button', { name: 'Følg opp' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pipeline/972483672',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ 'X-Hugin': '1' }),
          body: JSON.stringify({ status: 'active' }),
        })
      )
    })

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Norsk Tipping AS følges nå opp under Søknader.')
    })
  })

  it('displays an all-caps Brreg employer name in title case, in the row and the track announce', async () => {
    const user = userEvent.setup()
    const ads = [
      ad({
        feedId: 'a1',
        title: 'Utvikler',
        employer: 'NORSK TIPPING AS',
        employerOrgnr: '972483672',
        pipelineStatus: null,
      }),
    ]
    renderList(fakeServer(ads))

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('Norsk Tipping AS')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('NORSK TIPPING AS')).not.toBeInTheDocument()

    await user.click(within(rows[0]).getByRole('button', { name: 'Følg opp' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Norsk Tipping AS følges nå opp under Søknader.')
    })
  })

  it('does not show a track button for an already-tracked company', async () => {
    const ads = [ad({ feedId: 'a1', employerOrgnr: '972483672', pipelineStatus: 'active' })]
    renderList(fakeServer(ads))

    await screen.findAllByRole('listitem')
    expect(screen.queryByRole('button', { name: 'Følg opp' })).not.toBeInTheDocument()
  })
})
