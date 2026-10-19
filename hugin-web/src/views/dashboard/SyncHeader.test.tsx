import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { SyncWatcherProvider } from '../../components/SyncWatcher'
import { Toaster } from '../../components/ui/toast'
import { LanguageProvider } from '../../i18n'
import { queryKeys } from '../../lib/queries'
import { makeQueryClient } from '../../lib/queryClient'
import type { AdDto, NewDto, StatusDto, SyncRunStatus } from '../../lib/types'
import { TestQueryProvider, toastRegion } from '../../test-utils'
import { SyncHeader } from './SyncHeader'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

function statusDto(overrides: Partial<StatusDto> = {}): StatusDto {
  return {
    brreg: { lastSyncUtc: '2026-08-18T10:00:00Z' },
    nav: { lastSyncUtc: '2026-08-18T10:05:00Z' },
    reviewMark: null,
    activeAds: 3,
    companies: 5,
    storedCompanies: 5,
    pipelineEntries: 2,
    readOnly: false,
    scopeConfigured: true,
    ...overrides,
  }
}

function syncStatus(overrides: Partial<SyncRunStatus> = {}): SyncRunStatus {
  return {
    running: false,
    startedUtc: null,
    finishedUtc: null,
    brreg: null,
    nav: null,
    ...overrides,
  }
}

function mockFetch(options: {
  status?: () => StatusDto
  syncStatus?: () => SyncRunStatus
  post?: () => Promise<Response>
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/status' && method === 'GET') {
      return Promise.resolve(jsonResponse(options.status?.() ?? statusDto()))
    }
    if (url === '/api/sync/status' && method === 'GET') {
      return Promise.resolve(jsonResponse(options.syncStatus?.() ?? syncStatus()))
    }
    if (url === '/api/sync' && method === 'POST') {
      return options.post ? options.post() : Promise.resolve(jsonResponse({}))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
}

function renderHeader(
  fetchMock: ReturnType<typeof vi.fn>,
  onSyncCompleted = vi.fn(),
  onRequestCoverage = vi.fn()
) {
  vi.stubGlobal('fetch', fetchMock)
  render(
    <TestQueryProvider>
      <LanguageProvider>
        <Toaster>
          <LiveRegionProvider>
            <SyncWatcherProvider onSyncCompleted={onSyncCompleted}>
              <SyncHeader onRequestCoverage={onRequestCoverage} />
            </SyncWatcherProvider>
          </LiveRegionProvider>
        </Toaster>
      </LanguageProvider>
    </TestQueryProvider>
  )
  return onSyncCompleted
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SyncHeader', () => {
  it('POSTs /api/sync and keeps polling when "Synk nå" is clicked', async () => {
    const fetchMock = mockFetch({})
    renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Synk nå' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/sync', expect.objectContaining({ method: 'POST' }))

    const pollsBefore = fetchMock.mock.calls.filter(([u]) => u === '/api/sync/status').length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    const pollsAfter = fetchMock.mock.calls.filter(([u]) => u === '/api/sync/status').length

    expect(pollsAfter).toBeGreaterThan(pollsBefore)
  })

  it('announces "Synk ferdig." and calls onSyncCompleted once on a running -> finished transition', async () => {
    let call = 0
    const fetchMock = mockFetch({
      syncStatus: () => {
        call += 1
        return call === 1
          ? syncStatus({ running: true, startedUtc: '2026-08-19T08:00:00Z' })
          : syncStatus({
              running: false,
              startedUtc: '2026-08-19T08:00:00Z',
              finishedUtc: '2026-08-19T08:01:00Z',
              brreg: { succeeded: true, fetched: 10, error: null },
              nav: { succeeded: true, fetched: 5, error: null },
            })
      },
    })
    const onSyncCompleted = renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(onSyncCompleted).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Synk ferdig.')).toBeInTheDocument()
  })

  it('resumes polling after a completed sync and detects a second completion (regression: restart must not depend on onSyncCompleted identity)', async () => {
    let call = 0
    const fetchMock = mockFetch({
      syncStatus: () => {
        call += 1
        // 1: idle (initial poll) · 2: running (1st sync) · 3: finished (1st completion)
        // 4: running (2nd sync) · 5+: finished (2nd completion)
        if (call === 1) return syncStatus({ running: false })
        if (call === 2) return syncStatus({ running: true, startedUtc: '2026-08-19T08:00:00Z' })
        if (call === 3)
          return syncStatus({
            running: false,
            startedUtc: '2026-08-19T08:00:00Z',
            finishedUtc: '2026-08-19T08:01:00Z',
            brreg: { succeeded: true, fetched: 10, error: null },
            nav: { succeeded: true, fetched: 5, error: null },
          })
        if (call === 4) return syncStatus({ running: true, startedUtc: '2026-08-19T08:05:00Z' })
        return syncStatus({
          running: false,
          startedUtc: '2026-08-19T08:05:00Z',
          finishedUtc: '2026-08-19T08:06:00Z',
          brreg: { succeeded: true, fetched: 1, error: null },
          nav: { succeeded: true, fetched: 1, error: null },
        })
      },
    })
    // A fresh callback each render mimics an un-memoized parent. The fix must not rely on it.
    const onSyncCompleted = renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Synk nå' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await act(async () => {
      // +100ms covers the LiveRegionProvider's announce debounce (see LiveRegion.tsx, 50ms) plus
      // react-query handing the poll result to React on the next tick.
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(onSyncCompleted).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Synk ferdig.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Synk nå' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByRole('button', { name: /synker/ })).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    expect(onSyncCompleted).toHaveBeenCalledTimes(2)
  })

  it('announces and renders a visible warning banner on partial failure', async () => {
    let call = 0
    const fetchMock = mockFetch({
      syncStatus: () => {
        call += 1
        return call === 1
          ? syncStatus({ running: true })
          : syncStatus({
              running: false,
              brreg: { succeeded: false, fetched: 0, error: 'Brreg utilgjengelig' },
              nav: { succeeded: true, fetched: 5, error: null },
            })
      },
    })
    renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Synk delvis feilet: Brreg utilgjengelig')
    // DESIGN.md's alert: a failure sentence carries «Prøv igjen» when there is something to retry.
    fireEvent.click(within(banner).getByRole('button', { name: 'Prøv igjen' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/sync', expect.objectContaining({ method: 'POST' }))

    const liveRegion = toastRegion()
    expect(liveRegion).toHaveTextContent('Synk delvis feilet: Brreg utilgjengelig')
  })

  it('says once when both registers synced in the same run, in words', async () => {
    const now = new Date().toISOString()
    renderHeader(
      mockFetch({
        status: () => statusDto({ brreg: { lastSyncUtc: now }, nav: { lastSyncUtc: now } }),
      })
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(
      screen.getByText(/^Synket i dag kl\. \d\d:\d\d fra Brønnøysundregisteret og NAV$/)
    ).toBeInTheDocument()
  })

  it('announces "En synk kjører allerede." when the POST is rejected with 409', async () => {
    const fetchMock = mockFetch({
      post: () => Promise.resolve(jsonResponse({ title: 'Kjører allerede' }, { status: 409 })),
    })
    renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Synk nå' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    const liveRegion = toastRegion()
    expect(liveRegion).toHaveTextContent('En synk kjører allerede.')
  })

  it('shows a load error with retry on the initial /api/status failure, and recovers on retry; the 2s poll stays silent', async () => {
    let statusShouldFail = true
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === '/api/status' && method === 'GET') {
        if (statusShouldFail) return Promise.reject(new Error('network down'))
        return Promise.resolve(jsonResponse(statusDto()))
      }
      if (url === '/api/sync/status' && method === 'GET') {
        return Promise.resolve(jsonResponse(syncStatus()))
      }
      return Promise.reject(new Error(`unhandled request ${method} ${url}`))
    })
    renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Kunne ikke laste synk-status.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Prøv igjen' })

    // The silent 2s poll ticking while /api/status is broken must not itself surface an error.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByText('Kunne ikke laste synk-status.')).toBeInTheDocument()

    statusShouldFail = false
    fireEvent.click(retry)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.queryByText('Kunne ikke laste synk-status.')).not.toBeInTheDocument()
    expect(screen.getByText('3 aktive annonser · 5 bedrifter · 2 i Søknader')).toBeInTheDocument()
  })

  it('announces a generic failure message (not "already running") on a non-409 POST failure', async () => {
    const fetchMock = mockFetch({
      post: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    renderHeader(fetchMock)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Synk nå' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    const liveRegion = toastRegion()
    expect(liveRegion).toHaveTextContent('Kunne ikke starte synk. Prøv igjen.')
    expect(liveRegion).not.toHaveTextContent('En synk kjører allerede.')
  })

  it('renders the empty-coverage prompt instead of the failure banner, and its button reopens the dialog (v3.5 Part A4)', async () => {
    let call = 0
    const fetchMock = mockFetch({
      syncStatus: () => {
        call += 1
        return call === 1
          ? syncStatus({ running: true })
          : syncStatus({
              running: false,
              brreg: {
                succeeded: false,
                fetched: 0,
                error: 'Ingen dekning valgt. Velg kommuner i dashbordet',
              },
              nav: { succeeded: true, fetched: 0, error: null },
            })
      },
    })
    const onRequestCoverage = vi.fn()
    renderHeader(fetchMock, vi.fn(), onRequestCoverage)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100)
    })

    // The raw "Synk delvis feilet: ..." banner never renders for this specific failure.
    expect(screen.queryByText(/Synk delvis feilet/)).not.toBeInTheDocument()
    const prompt = screen.getByRole('status')
    const button = screen.getByRole('button', { name: 'Velg dekning' })
    expect(prompt).toHaveTextContent('Ingen dekning valgt.')

    fireEvent.click(button)
    expect(onRequestCoverage).toHaveBeenCalledTimes(1)

    const liveRegion = toastRegion()
    expect(liveRegion).toHaveTextContent(
      'Ingen dekning valgt. Velg fylke, kommune eller hele landet.'
    )
  })
})

describe('SyncHeader: Mark as seen', () => {
  // The popover and userEvent need real timers; the poll tests above run on fake ones.
  beforeEach(() => {
    vi.useRealTimers()
  })

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
      sourceUrl: null,
      pipelineStatus: null,
      hidden: false,
      isActive: true,
      linkedOrgnr: null,
      published: '2026-08-10T00:00:00Z',
      firstSeen: '2026-08-10T00:00:00Z',
      ...overrides,
    }
  }

  function newDto(overrides: Partial<NewDto> = {}): NewDto {
    return {
      companies: [],
      ads: [newAd()],
      since: '2026-08-12T00:00:00Z',
      asOf: '2026-08-19T09:30:00Z',
      ...overrides,
    }
  }

  /** Status and sync as in the tests above; GET /api/new answers `delta()`, POST /api/seen
   * `seenStatus` (204 by default), POST /api/sync 202. */
  function seenServer(delta: () => NewDto, seenStatus = 204) {
    return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === '/api/status') return Promise.resolve(jsonResponse(statusDto()))
      if (url === '/api/sync/status') return Promise.resolve(jsonResponse(syncStatus()))
      if (url === '/api/new') return Promise.resolve(jsonResponse(delta()))
      if (url === '/api/seen' && method === 'POST') {
        return Promise.resolve(
          seenStatus === 204
            ? new Response(null, { status: 204 })
            : jsonResponse({ title: 'Feil' }, { status: seenStatus })
        )
      }
      if (url === '/api/sync' && method === 'POST') {
        return Promise.resolve(jsonResponse({}, { status: 202 }))
      }
      return Promise.reject(new Error(`unhandled request ${method} ${url}`))
    })
  }

  function renderSeen(fetchMock: ReturnType<typeof vi.fn>, client = makeQueryClient()) {
    vi.stubGlobal('fetch', fetchMock)
    render(
      <TestQueryProvider client={client}>
        <LanguageProvider>
          <Toaster>
            <LiveRegionProvider>
              <SyncWatcherProvider onSyncCompleted={vi.fn()}>
                <SyncHeader onRequestCoverage={vi.fn()} />
              </SyncWatcherProvider>
            </LiveRegionProvider>
          </Toaster>
        </LanguageProvider>
      </TestQueryProvider>
    )
    return client
  }

  const seenPosts = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.filter(([u]) => u === '/api/seen').map(([, i]) => (i as RequestInit).body)

  it('POSTs the exact asOf of the shown delta when confirmed in the popover', async () => {
    const user = userEvent.setup()
    const fetchMock = seenServer(() => newDto({ asOf: '2026-08-19T09:30:00Z' }))
    renderSeen(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const popover = await screen.findByRole('dialog')
    await user.click(within(popover).getByRole('button', { name: 'Flytt merket' }))

    await waitFor(() =>
      expect(seenPosts(fetchMock)).toEqual([JSON.stringify({ asOf: '2026-08-19T09:30:00Z' })])
    )
  })

  it('drops a failed mark’s error once the mark is tried again or a sync starts', async () => {
    const user = userEvent.setup()
    renderSeen(seenServer(() => newDto(), 500))
    const markAndFail = async () => {
      await user.click(screen.getByRole('button', { name: 'Merk som sett' }))
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Flytt merket' })
      )
      await screen.findByText('Kunne ikke merke som sett.')
    }

    await screen.findByRole('button', { name: 'Merk som sett' })
    await markAndFail()
    await user.click(screen.getByRole('button', { name: 'Merk som sett' }))
    expect(screen.queryByText('Kunne ikke merke som sett.')).not.toBeInTheDocument()
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Avbryt' })
    )

    await markAndFail()
    await user.click(screen.getByRole('button', { name: 'Synk nå' }))
    expect(screen.queryByText('Kunne ikke merke som sett.')).not.toBeInTheDocument()
  })

  it('POSTs nothing when the popover is cancelled', async () => {
    const user = userEvent.setup()
    const fetchMock = seenServer(() => newDto())
    renderSeen(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const popover = await screen.findByRole('dialog')
    await user.click(within(popover).getByRole('button', { name: 'Avbryt' }))

    expect(seenPosts(fetchMock)).toEqual([])
  })

  it('announces "Merket som sett." and moves focus to the headline after confirming', async () => {
    const user = userEvent.setup()
    renderSeen(seenServer(() => newDto()))

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    const popover = await screen.findByRole('dialog')
    await user.click(within(popover).getByRole('button', { name: 'Flytt merket' }))

    const headline = screen.getByRole('heading', { level: 2 })
    await waitFor(() => expect(document.activeElement).toBe(headline))
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Merket som sett.')
    )
  })

  it('posts the asOf shown when the popover opened, not a newer one from a refetch while it was open (regression)', async () => {
    const user = userEvent.setup()
    let current = newDto({ asOf: '2026-08-19T09:30:00Z' })
    const fetchMock = seenServer(() => current)
    const client = renderSeen(fetchMock)

    await user.click(await screen.findByRole('button', { name: 'Merk som sett' }))
    await screen.findByRole('dialog')

    // A sync finishes while the popover is open: /api/new now has a newer asOf and one more ad.
    current = newDto({
      asOf: '2026-08-19T10:15:00Z',
      ads: [newAd(), newAd({ feedId: 'a2', title: 'Ny annonse fra runde to' })],
    })
    await act(() => client.invalidateQueries({ queryKey: queryKeys.new }))
    // The headline only reads «2 nye annonser» once the refetch has applied.
    await screen.findByRole('heading', { level: 2, name: /^2 nye annonser/ })

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Flytt merket' })
    )

    await waitFor(() =>
      expect(seenPosts(fetchMock)).toEqual([JSON.stringify({ asOf: '2026-08-19T09:30:00Z' })])
    )
  })

  it('offers no Mark as seen when nothing is new', async () => {
    renderSeen(seenServer(() => newDto({ ads: [], companies: [] })))

    await screen.findByRole('heading', { level: 2, name: /^Ingenting nytt siden/ })
    expect(screen.queryByRole('button', { name: 'Merk som sett' })).not.toBeInTheDocument()
  })
})
