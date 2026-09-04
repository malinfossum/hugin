import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { LanguageProvider } from '../../i18n'
import type { StatusDto, SyncRunStatus } from '../../types'
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
    pipelineEntries: 2,
    readOnly: false,
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

function renderHeader(fetchMock: ReturnType<typeof vi.fn>, onSyncCompleted = vi.fn()) {
  vi.stubGlobal('fetch', fetchMock)
  render(
    <LanguageProvider>
      <LiveRegionProvider>
        <SyncHeader onSyncCompleted={onSyncCompleted} />
      </LiveRegionProvider>
    </LanguageProvider>
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
      await vi.advanceTimersByTimeAsync(2050)
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
    // A fresh callback each render mimics an un-memoized parent — the fix must not rely on it.
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
      // +50ms covers the LiveRegionProvider's announce debounce (see LiveRegion.tsx).
      await vi.advanceTimersByTimeAsync(2050)
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
      await vi.advanceTimersByTimeAsync(2050)
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
      await vi.advanceTimersByTimeAsync(2050)
    })

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Synk delvis feilet: Brreg utilgjengelig')

    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).toHaveTextContent('Synk delvis feilet: Brreg utilgjengelig')
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

    const liveRegion = document.querySelector('[aria-live="polite"]')
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

    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).toHaveTextContent('Kunne ikke starte synk — prøv igjen.')
    expect(liveRegion).not.toHaveTextContent('En synk kjører allerede.')
  })
})
