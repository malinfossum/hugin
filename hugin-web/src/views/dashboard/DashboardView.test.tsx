import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../../components/LiveRegion'
import { LanguageProvider } from '../../i18n'
import type { AdDto } from '../../lib/types'
import { DashboardView } from './DashboardView'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function ad(overrides: Partial<AdDto> = {}): AdDto {
  return {
    feedId: 'a1',
    title: 'Utvikler',
    employer: 'Acme AS',
    employerOrgnr: '715787630',
    kommune: '0301',
    kommuneNavn: null,
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

/** One fake server for all five cards. `ads` feeds both NeedsAction and DeadlineList;
 * `newFails` makes /api/new answer 500 so NewSinceLastVisit shows its error state. */
function fakeServer(ads: AdDto[], options: { newFails?: boolean } = {}) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/status') {
      return Promise.resolve(
        jsonResponse({
          brreg: null,
          nav: null,
          reviewMark: null,
          activeAds: 0,
          companies: 0,
          pipelineEntries: 0,
          readOnly: false,
          scopeConfigured: true,
        })
      )
    }
    if (url === '/api/sync/status') {
      return Promise.resolve(
        jsonResponse({
          running: false,
          startedUtc: null,
          finishedUtc: null,
          brreg: null,
          nav: null,
        })
      )
    }
    if (url === '/api/sources') return Promise.resolve(jsonResponse([]))
    if (url === '/api/ads') return Promise.resolve(jsonResponse(ads))
    if (url === '/api/new') {
      return Promise.resolve(
        options.newFails
          ? jsonResponse({ title: 'nede' }, 500)
          : jsonResponse({
              companies: [],
              ads: [],
              since: '2026-10-01T00:00:00Z',
              asOf: '2026-10-02T00:00:00Z',
            })
      )
    }
    return Promise.reject(new Error(`unhandled request ${url}`))
  })
}

function renderDashboard(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <DashboardView sourcesVersion={0} onRequestCoverage={vi.fn()} />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

/** The card headings in DOM order. A closed ConfirmDialog still renders its own h2 inside a
 * <dialog>, so headings inside a dialog are not cards and are skipped. */
const headingTexts = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .filter((heading) => !heading.closest('dialog'))
    .map((heading) => heading.textContent)

/** The element directly under a card's h2: where the description must sit. */
function elementUnder(headingName: string) {
  const heading = screen.getByRole('heading', { level: 2, name: headingName })
  return heading.nextElementSibling as HTMLElement
}

function expectDescription(headingName: string, text: string) {
  const description = elementUnder(headingName)
  expect(description.tagName).toBe('P')
  expect(description).toHaveClass('text-muted')
  expect(description).toHaveTextContent(text)
}

const WATCHED_SOON = ad({
  feedId: 'w1',
  title: 'Fulgt annonse',
  pipelineStatus: 'active',
  daysLeft: 3,
})
const UNTRACKED = ad({ feedId: 'u1', title: 'Løs annonse', pipelineStatus: null, daysLeft: 3 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardView', () => {
  it('orders the cards action first, sources last', async () => {
    renderDashboard(fakeServer([WATCHED_SOON]))
    await screen.findByRole('heading', { level: 2, name: 'Trenger handling' })

    expect(headingTexts()).toEqual([
      'Synkronisering',
      'Trenger handling',
      'Frister',
      'Nytt siden sist',
      'Kilder',
    ])
  })

  it('puts Frister directly under the sync strip when nothing needs action', async () => {
    renderDashboard(fakeServer([UNTRACKED]))
    await screen.findByText('Løs annonse')

    expect(headingTexts()).toEqual(['Synkronisering', 'Frister', 'Nytt siden sist', 'Kilder'])
  })

  it('gives every card a muted description directly under its heading', async () => {
    renderDashboard(fakeServer([WATCHED_SOON]))
    await screen.findByRole('heading', { level: 2, name: 'Trenger handling' })

    expectDescription(
      'Trenger handling',
      'Annonser fra bedrifter du følger med på, med frist innen 7 dager eller allerede utløpt.'
    )
    expectDescription('Frister', 'Åpne annonser i området ditt, nærmeste frist først.')
    expectDescription(
      'Nytt siden sist',
      'Bedrifter og annonser som har kommet til siden du sist trykket «Merk som sett».'
    )
    expectDescription('Kilder', 'Registrene Hugin henter fra, og stillingssider du sjekker selv.')
  })

  it('reads the descriptions in English', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    renderDashboard(fakeServer([WATCHED_SOON]))
    await screen.findByRole('heading', { level: 2, name: 'Needs action' })

    expectDescription(
      'Needs action',
      "Ads from companies you're watching that close within 7 days or have already closed."
    )
    expectDescription('Deadlines', 'Open ads in your area, closest deadline first.')
    expectDescription(
      'New since last visit',
      'Companies and ads added since you last pressed "Mark as seen".'
    )
    expectDescription(
      'Sources',
      'The registers Hugin reads from, and job sites you check yourself.'
    )
  })

  it('keeps the description when the card fails to load', async () => {
    renderDashboard(fakeServer([], { newFails: true }))
    await screen.findByText('Kunne ikke laste nytt siden sist.')

    expectDescription(
      'Nytt siden sist',
      'Bedrifter og annonser som har kommet til siden du sist trykket «Merk som sett».'
    )
  })

  it('gives the sync strip no description', async () => {
    renderDashboard(fakeServer([]))
    await screen.findByRole('heading', { level: 2, name: 'Synkronisering' })

    expect(elementUnder('Synkronisering').tagName).toBe('DL')
  })
})
