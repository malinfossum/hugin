import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusProvider } from './context/focus'
import { ReadOnlyProvider } from './context/readOnly'
import { LanguageProvider } from './i18n'
import { queryKeys } from './lib/queries'
import { makeQueryClient } from './lib/queryClient'
import { createAppRouter } from './router'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** The fake server's state, changed by a test between steps. */
interface ServerState {
  companyName: string
  syncRunning: boolean
  /** The digest has no new companies, as after «Merk som sett» (Task 6). */
  newEmpty?: boolean
  /** The digest request fails, as on a server hiccup. */
  newFails?: boolean
}

function fakeServer(state: ServerState) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (method !== 'GET') return Promise.reject(new Error(`unhandled request ${method} ${url}`))
    if (url.startsWith('/api/companies?')) {
      return Promise.resolve(
        jsonResponse({
          total: 1,
          groups: [{ main: { orgnr: '715787630', name: state.companyName }, branches: [] }],
        })
      )
    }
    switch (url) {
      case '/api/status':
        return Promise.resolve(
          jsonResponse({
            brreg: null,
            nav: null,
            reviewMark: null,
            activeAds: 0,
            companies: 1,
            pipelineEntries: 0,
            readOnly: false,
            scopeConfigured: true,
            version: 'v3.10.0',
          })
        )
      case '/api/sync/status':
        return Promise.resolve(
          jsonResponse({
            running: state.syncRunning,
            startedUtc: '2026-10-12T08:00:00Z',
            finishedUtc: state.syncRunning ? null : '2026-10-12T08:01:00Z',
            brreg: null,
            nav: null,
          })
        )
      case '/api/companies/715787630':
        return Promise.resolve(
          jsonResponse({
            company: { orgnr: '715787630', name: state.companyName },
            ads: [],
            branches: [],
          })
        )
      case '/api/new':
        if (state.newFails) return Promise.resolve(new Response('boom', { status: 500 }))
        return Promise.resolve(
          jsonResponse({
            companies: state.newEmpty
              ? []
              : [
                  {
                    orgnr: '715787630',
                    name: state.companyName,
                    kommune: '3403',
                    kommuneNavn: 'Hamar',
                    naceCode: '62.010',
                    isBranch: false,
                    website: null,
                    parentOrgnr: null,
                    openAds: 0,
                  },
                ],
            ads: [],
            since: '2026-10-01T00:00:00Z',
            asOf: '2026-10-14T08:00:00Z',
          })
        )
      case '/api/ads':
        return Promise.resolve(jsonResponse([]))
      case '/api/sources':
        return Promise.resolve(
          jsonResponse([{ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }])
        )
      case '/api/pipeline':
      case '/api/kommuner':
        return Promise.resolve(jsonResponse([]))
      case '/api/config/discovery':
        return Promise.resolve(jsonResponse({ municipalities: [], fylker: [], allOfNorway: true }))
      case '/api/config/focus':
        return Promise.resolve(jsonResponse({ naeringskoder: ['62'], keywords: [] }))
      default:
        return Promise.reject(new Error(`unhandled request ${url}`))
    }
  })
}

/** App's provider tree, but with the test holding the QueryClient (to read the cache) and the
 * router (on a memory history, so no browser URL leaks between tests). */
function renderApp(url: string, client: QueryClient = makeQueryClient()) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [url] }) })
  render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <ReadOnlyProvider>
          <FocusProvider>
            <RouterProvider router={router} />
          </FocusProvider>
        </ReadOnlyProvider>
      </LanguageProvider>
    </QueryClientProvider>
  )
  return { client, router }
}

beforeEach(() => {
  // A stored focus keeps the first-run dialog shut, so the views are what's on screen.
  window.localStorage.setItem(
    'hugin-focus',
    JSON.stringify({ v: 1, fylke: null, kommune: null, categories: [] })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('AppShell sync completion', () => {
  it('a sync that finishes while another view is open refreshes the ads, the digest, the company list and every company detail', async () => {
    const state: ServerState = { companyName: 'Acme AS', syncRunning: false }
    vi.stubGlobal('fetch', fakeServer(state))
    const user = userEvent.setup()
    const { client, router } = renderApp('/companies/715787630')

    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    // The dashboard's lists, as a visit there would have left them in the cache.
    client.setQueryData(queryKeys.adsList(false), [])
    client.setQueryData(queryKeys.new, null)

    // The detail is a modal dialog: the nav behind it is reached once it is closed.
    await user.click(screen.getByRole('button', { name: 'Lukk' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'))
    await user.click(screen.getByRole('link', { name: 'Søknader' }))
    expect(router.state.location.pathname).toBe('/applications')

    // The poll sees the sync running, then finished with the new data on the server. The watcher
    // handles a poll once its result has rendered and tells polls apart by their update time, so
    // the first one gets a moment to render before the second lands.
    state.syncRunning = true
    await act(() => client.refetchQueries({ queryKey: queryKeys.syncStatus }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)))
    state.companyName = 'Acme Ny AS'
    state.syncRunning = false
    await act(() => client.refetchQueries({ queryKey: queryKeys.syncStatus }))

    // None of these is on screen, so each stays marked stale until a view needs it again.
    // The company list is paged: every page query lives under queryKeys.companies.
    const companyLists = () => client.getQueryCache().findAll({ queryKey: queryKeys.companies })
    await waitFor(() =>
      expect(companyLists().length > 0 && companyLists().every((q) => q.state.isInvalidated)).toBe(
        true
      )
    )
    for (const key of [queryKeys.adsList(false), queryKeys.new, queryKeys.company('715787630')]) {
      expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true)
    }

    // Back on the detail (past the list its close left), within the minute it would otherwise
    // have stayed fresh.
    act(() => router.history.go(-2))
    expect(await screen.findByRole('heading', { name: 'Acme Ny AS' })).toBeInTheDocument()
  })
})

describe('AppShell unsaved-changes guard', () => {
  const QUESTION = 'Forlate siden uten å lagre?'

  it('asks before the nav leaves a form with unsaved text; staying keeps the draft', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/settings')

    await user.type(await screen.findByLabelText('Etikett'), 'Ny kilde')
    await user.click(screen.getByRole('link', { name: 'Søknader' }))

    const dialog = await screen.findByRole('alertdialog', { name: QUESTION })
    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

    expect(screen.queryByRole('alertdialog', { name: QUESTION })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/settings')
    expect(screen.getByLabelText('Etikett')).toHaveValue('Ny kilde')
  })

  it('leaves once the person confirms', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/settings')

    await user.type(await screen.findByLabelText('Etikett'), 'Ny kilde')
    await user.click(screen.getByRole('link', { name: 'Søknader' }))
    const dialog = await screen.findByRole('alertdialog', { name: QUESTION })
    await user.click(within(dialog).getByRole('button', { name: 'Forlat uten å lagre' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/applications'))
    expect(screen.queryByLabelText('Etikett')).not.toBeInTheDocument()
  })

  it('a form opened but left as it loaded navigates without asking', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/settings')

    // The edit form opens filled with the source as it is: nothing changed yet.
    await user.click(await screen.findByRole('button', { name: 'Rediger' }))
    expect(screen.getByDisplayValue('https://finn.no')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Søknader' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/applications'))
    expect(screen.queryByRole('alertdialog', { name: QUESTION })).not.toBeInTheDocument()
  })
})

describe('AppShell page title', () => {
  it('names the view in the document title, and follows the language', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    renderApp('/')

    await waitFor(() => expect(document.title).toBe('Hugin'))
    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))
    await waitFor(() => expect(document.title).toBe('Bedrifter · Hugin'))
    await user.click(screen.getByRole('button', { name: 'Switch to English' }))
    await waitFor(() => expect(document.title).toBe('Companies · Hugin'))
  })
})

describe('AppShell logo', () => {
  afterEach(() => {
    window.localStorage.removeItem('hugin-lang')
  })

  it('is a link to the dashboard named after the visible word', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/applications')

    const logo = await screen.findByRole('link', { name: 'Hugin, til dashbordet' })
    expect(logo).toHaveAttribute('href', '/')
    await user.click(logo)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    // Like the nav: focus stays on the link that was activated.
    expect(logo).toHaveFocus()
  })

  it('returns to the dashboard with its last ?show=, like the nav item', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/?show=all')

    await user.click(await screen.findByRole('link', { name: 'Søknader' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/applications'))
    await user.click(screen.getByRole('link', { name: 'Hugin, til dashbordet' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.location.search).toEqual({ show: 'all' })
  })

  it('has an English name too', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    renderApp('/applications')

    expect(await screen.findByRole('link', { name: 'Hugin, to the dashboard' })).toHaveAttribute(
      'href',
      '/'
    )
  })
})

/** Opens the places in «Nytt siden sist» (each starts closed) and returns a new company's link. */
async function newCompanyLink(user: ReturnType<typeof userEvent.setup>, name = 'Acme AS') {
  const section = await screen.findByRole('region', { name: 'Nytt siden sist' })
  for (const place of await within(section).findAllByRole('button', { expanded: false }))
    await user.click(place)
  return screen.findByRole('link', { name })
}

describe('AppShell opening a company detail', () => {
  it('from «Nytt siden sist», focus moves to the company heading', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await newCompanyLink(user))

    const heading = await screen.findByRole('heading', { level: 2, name: 'Acme AS' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('from the company list, focus moves to the company heading', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    renderApp('/companies')

    await user.click(await screen.findByRole('button', { name: /Acme AS/ }))

    const heading = await screen.findByRole('heading', { level: 2, name: 'Acme AS' })
    await waitFor(() => expect(heading).toHaveFocus())
  })
})

describe('AppShell closing a company detail', () => {
  it('returns to the dashboard it was opened from, with focus on the remounted link', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/')

    const link = await newCompanyLink(user)
    await user.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    await user.click(await screen.findByRole('button', { name: 'Lukk' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    // Back, not a new entry: the dashboard's own entry is current again.
    expect(router.history.location.state.__TSR_index).toBe(0)
    const again = await screen.findByRole('link', { name: 'Acme AS' })
    // The dashboard remounted, so this is a new element, found by identity.
    expect(again).not.toBe(link)
    await waitFor(() => expect(again).toHaveFocus())
  })

  it('the browser Back button restores the same focus', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/')

    await user.click(await newCompanyLink(user))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    act(() => router.history.back())

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const again = await screen.findByRole('link', { name: 'Acme AS' })
    await waitFor(() => expect(again).toHaveFocus())
  })

  it('reaching the dashboard again through the nav is not a return: focus is not pulled onto the old link', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { client, router } = renderApp('/')

    await user.click(await newCompanyLink(user))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    // The detail is a modal dialog, so the nav sits behind it. A new entry for the dashboard
    // stands in for any way there that is not Back. Focus does not move, so the entry-index rule
    // is what keeps restore from focusing the old link, not "focus has moved".
    act(() => {
      router.navigate({ to: '/' })
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    const link = await screen.findByRole('link', { name: 'Acme AS' })
    // The card's refetch has settled, so restore has had its chance to run.
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(document.body).toHaveFocus()
    expect(link).not.toHaveFocus()
  })

  it('opened from the list, close goes back to the list entry and refocuses the row', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/companies')

    await user.click(await screen.findByRole('button', { name: /Acme AS/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    await user.click(await screen.findByRole('button', { name: 'Lukk' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'))
    expect(router.history.location.state.__TSR_index).toBe(0)
    await waitFor(() => expect(screen.getByRole('button', { name: /Acme AS/ })).toHaveFocus())
  })

  it('regression guard: on a cold deep link, close lands on the company list, not outside the app', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/companies/715787630')

    await user.click(await screen.findByRole('button', { name: 'Lukk' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'))
    expect(await screen.findByRole('button', { name: /Acme AS/ })).toBeInTheDocument()
  })

  it('a company gone from the fresh digest returns focus to the card heading, not the body', async () => {
    const state: ServerState = { companyName: 'Acme AS', syncRunning: false }
    vi.stubGlobal('fetch', fakeServer(state))
    const user = userEvent.setup()
    const { router } = renderApp('/')

    await user.click(await newCompanyLink(user))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    // Marked seen in another tab meanwhile: the cache still has the company, the server not.
    state.newEmpty = true
    await user.click(await screen.findByRole('button', { name: 'Lukk' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Nytt siden sist' })).toHaveFocus()
    )
    expect(screen.queryByRole('link', { name: 'Acme AS' })).not.toBeInTheDocument()
  })

  it('a Back whose digest refetch fails returns focus to the card heading, not the body', async () => {
    const state: ServerState = { companyName: 'Acme AS', syncRunning: false }
    vi.stubGlobal('fetch', fakeServer(state))
    const user = userEvent.setup()
    const { router } = renderApp('/')

    await user.click(await newCompanyLink(user))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    // The cache still has the digest, so the card remounts with data and the refetch then fails.
    state.newFails = true
    await user.click(await screen.findByRole('button', { name: 'Lukk' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: 'Nytt siden sist' })).toHaveFocus()
    )
    expect(screen.queryByRole('link', { name: 'Acme AS' })).not.toBeInTheDocument()
  })

  it('a repeated close (Enter held down) goes back one step, not two', async () => {
    vi.stubGlobal('fetch', fakeServer({ companyName: 'Acme AS', syncRunning: false }))
    const user = userEvent.setup()
    const { router } = renderApp('/applications')

    await user.click(await screen.findByRole('link', { name: 'Dashbord' }))
    await user.click(await newCompanyLink(user))
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies/715787630'))
    const back = await screen.findByRole('button', { name: 'Lukk' })
    // Both clicks land before the router has rendered the first Back.
    act(() => {
      back.click()
      back.click()
    })

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.history.location.state.__TSR_index).toBe(1)
  })
})
