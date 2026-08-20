import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdDto } from '../../types'
import { TrengerHandling } from './TrengerHandling'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
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

function mockFetch(ads: AdDto[]) {
  return vi.fn(() => Promise.resolve(jsonResponse(ads)))
}

function renderTrenger(fetchMock: ReturnType<typeof vi.fn>, refreshKey = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(<TrengerHandling refreshKey={refreshKey} />)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TrengerHandling', () => {
  it('shows only funnet entries with a near frist', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Skal med', pipelineStatus: 'funnet', daysLeft: 3 }),
      ad({ feedId: 'a2', title: 'Feil status', pipelineStatus: 'soekt-selv', daysLeft: 2 }),
      ad({ feedId: 'a3', title: 'For langt unna', pipelineStatus: 'funnet', daysLeft: 10 }),
      ad({ feedId: 'a4', title: 'Ingen frist', pipelineStatus: 'funnet', daysLeft: null }),
      ad({ feedId: 'a5', title: 'Frist i dag', pipelineStatus: 'funnet', daysLeft: 0 }),
    ]
    renderTrenger(mockFetch(ads))

    const item = await screen.findByText(/Skal med/)
    expect(item).toHaveTextContent('funnet, ikke søkt — frist om 3 dager')

    const today = screen.getByText(/Frist i dag/)
    expect(today).toHaveTextContent('funnet, ikke søkt — frist i dag')

    expect(screen.queryByText(/Feil status/)).not.toBeInTheDocument()
    expect(screen.queryByText(/For langt unna/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ingen frist/)).not.toBeInTheDocument()
  })

  it('shows "frist utløpt" for an overdue (negative daysLeft) funnet entry', async () => {
    const ads = [ad({ feedId: 'a1', title: 'Forfalt', pipelineStatus: 'funnet', daysLeft: -1 })]
    renderTrenger(mockFetch(ads))

    const item = await screen.findByText(/Forfalt/)
    expect(item).toHaveTextContent('funnet, ikke søkt — frist utløpt')
  })

  it('renders nothing when there are no near-frist funnet entries', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Feil status', pipelineStatus: 'soekt-selv', daysLeft: 2 }),
      ad({ feedId: 'a2', title: 'For langt unna', pipelineStatus: 'funnet', daysLeft: 10 }),
    ]
    const fetchMock = mockFetch(ads)
    const { container } = renderTrenger(fetchMock)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(container).toBeEmptyDOMElement()
  })
})
