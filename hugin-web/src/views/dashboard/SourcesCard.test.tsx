import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../i18n'
import type { SourceDto } from '../../types'
import { SourcesCard } from './SourcesCard'

function sourceDto(overrides: Partial<SourceDto> = {}): SourceDto {
  return {
    id: 1,
    label: 'Ledige utviklerjobber på FINN Innlandet',
    url: 'https://www.finn.no/job/search?q=utvikler',
    position: 0,
    ...overrides,
  }
}

/** Fake server: GET /api/sources returns the given list, or rejects when null. */
function fakeServer(sources: SourceDto[] | null) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/sources' && method === 'GET') {
      if (sources === null) return Promise.reject(new Error('network down'))
      return Promise.resolve(
        new Response(JSON.stringify(sources), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
}

function renderCard(fetchMock: ReturnType<typeof vi.fn>, refreshToken = 0) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <SourcesCard refreshToken={refreshToken} />
    </LanguageProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SourcesCard', () => {
  it('renders a section with the Kilder heading', async () => {
    renderCard(fakeServer([]))

    expect(await screen.findByRole('heading', { name: 'Kilder' })).toBeInTheDocument()
  })

  it('always renders Brreg and NAV first, from their i18n keys', async () => {
    renderCard(fakeServer([]))

    const links = await screen.findAllByRole('link')
    expect(links[0]).toHaveTextContent('Brønnøysundregisteret')
    expect(links[0]).toHaveAttribute('href', 'https://www.brreg.no')
    expect(links[1]).toHaveTextContent('NAV')
    expect(links[1]).toHaveAttribute('href', 'https://arbeidsplassen.nav.no/stillinger')
  })

  it('renders fetched sources after the fixed links, in the position order the API returned, with shortened labels', async () => {
    // The API orders by position server-side (Task 2) — the card renders the list as received.
    renderCard(
      fakeServer([
        sourceDto({
          id: 1,
          label: 'Ledige utviklerjobber på FINN Innlandet',
          url: 'https://www.finn.no/job/search?q=utvikler',
          position: 0,
        }),
        sourceDto({
          id: 2,
          label: 'Some LinkedIn label',
          url: 'https://www.linkedin.com/jobs',
          position: 1,
        }),
      ])
    )

    await screen.findByRole('link', { name: 'LinkedIn' })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[2]).toHaveTextContent('FINN')
    expect(links[2]).toHaveAttribute('href', 'https://www.finn.no/job/search?q=utvikler')
    expect(links[3]).toHaveTextContent('LinkedIn')
    expect(links[3]).toHaveAttribute('href', 'https://www.linkedin.com/jobs')
  })

  it('still shows the two fixed links when the fetch fails', async () => {
    renderCard(fakeServer(null))

    const brreg = await screen.findByRole('link', { name: 'Brønnøysundregisteret' })
    expect(brreg).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NAV' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
