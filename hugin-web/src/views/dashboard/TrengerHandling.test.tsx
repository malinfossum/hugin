import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FocusProvider } from '../../focus'
import { LanguageProvider } from '../../i18n'
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
    linkedOrgnr: null,
    published: '2026-08-10T00:00:00Z',
    ...overrides,
  }
}

function mockFetch(ads: AdDto[]) {
  return vi.fn(() => Promise.resolve(jsonResponse(ads)))
}

function renderTrenger(fetchMock: ReturnType<typeof vi.fn>, refreshKey = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <TrengerHandling refreshKey={refreshKey} />
    </LanguageProvider>
  )
}

/** Same as renderTrenger but wrapped in FocusProvider, for tests that seed a focus. */
function renderTrengerWithFocus(fetchMock: ReturnType<typeof vi.fn>, refreshKey = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <FocusProvider>
        <TrengerHandling refreshKey={refreshKey} />
      </FocusProvider>
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('TrengerHandling', () => {
  it('shows only active entries with a near frist', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Skal med', pipelineStatus: 'active', daysLeft: 3 }),
      ad({ feedId: 'a2', title: 'Feil status', pipelineStatus: 'applied', daysLeft: 2 }),
      ad({ feedId: 'a3', title: 'For langt unna', pipelineStatus: 'active', daysLeft: 10 }),
      ad({ feedId: 'a4', title: 'Ingen frist', pipelineStatus: 'active', daysLeft: null }),
      ad({ feedId: 'a5', title: 'Frist i dag', pipelineStatus: 'active', daysLeft: 0 }),
    ]
    renderTrenger(mockFetch(ads))

    const item = await screen.findByText(/Skal med/)
    expect(item).toHaveTextContent('aktiv, ikke søkt — frist om 3 dager')

    const today = screen.getByText(/Frist i dag/)
    expect(today).toHaveTextContent('aktiv, ikke søkt — frist i dag')

    expect(screen.queryByText(/Feil status/)).not.toBeInTheDocument()
    expect(screen.queryByText(/For langt unna/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ingen frist/)).not.toBeInTheDocument()
  })

  it('shows "frist utløpt" for an overdue (negative daysLeft) active entry', async () => {
    const ads = [ad({ feedId: 'a1', title: 'Forfalt', pipelineStatus: 'active', daysLeft: -1 })]
    renderTrenger(mockFetch(ads))

    const item = await screen.findByText(/Forfalt/)
    expect(item).toHaveTextContent('aktiv, ikke søkt — frist utløpt')
  })

  it('renders nothing when there are no near-frist active entries', async () => {
    const ads = [
      ad({ feedId: 'a1', title: 'Feil status', pipelineStatus: 'applied', daysLeft: 2 }),
      ad({ feedId: 'a2', title: 'For langt unna', pipelineStatus: 'active', daysLeft: 10 }),
    ]
    const fetchMock = mockFetch(ads)
    const { container } = renderTrenger(fetchMock)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a load error with retry on fetch failure, and the section does not vanish', async () => {
    const user = userEvent.setup()
    const failing = vi.fn(() => Promise.reject(new Error('network down')))
    vi.stubGlobal('fetch', failing)
    render(
      <LanguageProvider>
        <TrengerHandling refreshKey={0} />
      </LanguageProvider>
    )

    expect(await screen.findByText('Kunne ikke laste annonser.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Prøv igjen' })
    expect(retry).toBeInTheDocument()

    const ads = [ad({ feedId: 'a1', title: 'Kom tilbake', pipelineStatus: 'active', daysLeft: 3 })]
    vi.stubGlobal('fetch', mockFetch(ads))
    await user.click(retry)

    await waitFor(() => {
      expect(screen.queryByText('Kunne ikke laste annonser.')).not.toBeInTheDocument()
    })
    expect(await screen.findByText(/Kom tilbake/)).toBeInTheDocument()
  })

  describe('with a saved focus', () => {
    function seedFocus() {
      window.localStorage.setItem(
        'hugin-focus',
        JSON.stringify({ v: 1, fylke: '34', kommune: null, categories: ['Utvikling'] })
      )
    }

    // TrengerHandling's own filter already requires pipelineStatus === 'active', so every ad it
    // shows is tracked — the adMatchesFocus bypass rule (tracked ads always pass, spec-mandated
    // to protect pipeline deadlines) makes the focus lens a structural no-op here. This ad sits
    // outside the seeded focus region (Oslo, kommune '0301', vs. focus fylke '34') and would be
    // filtered by region if the bypass didn't apply — it must still render.
    it('still shows a tracked, near-deadline ad outside the focus region (bypass makes the lens a no-op here)', async () => {
      seedFocus()
      const ads = [
        ad({
          feedId: 'a1',
          title: 'Oslo-jobb, sporet',
          kommune: '0301',
          category: 'IT / Utvikling',
          pipelineStatus: 'active',
          daysLeft: 3,
        }),
      ]
      renderTrengerWithFocus(mockFetch(ads))

      expect(await screen.findByText(/Oslo-jobb, sporet/)).toBeInTheDocument()
    })
  })
})
