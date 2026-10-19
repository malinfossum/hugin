import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Fake server covering what the Companies and Settings views need on mount, plus
 * FirstRunDialog's four calls (every test that renders <App /> hits it, since focus starts
 * unstored). It is a bare, no-scope-chosen response set so the dialog's own suite
 * (FirstRunDialog.test.tsx) carries the interesting scope/kommune scenarios. */
function fakeServer(
  options: {
    putFails?: boolean
    readOnly?: boolean
    statusFails?: boolean
    scopeConfigured?: boolean
    companies?: { orgnr: string; name: string; kommune: string | null }[]
  } = {}
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/status') {
      if (options.statusFails) {
        return Promise.resolve(
          new Response(JSON.stringify({ title: 'nede' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      return Promise.resolve(
        jsonResponse({
          brreg: null,
          nav: null,
          reviewMark: null,
          activeAds: 0,
          companies: 0,
          pipelineEntries: 0,
          readOnly: options.readOnly ?? false,
          scopeConfigured: options.scopeConfigured ?? true,
        })
      )
    }
    if (url.startsWith('/api/companies?')) {
      // One page of the server-side company list; no filtering needed in these tests.
      const companies = options.companies ?? []
      return Promise.resolve(
        jsonResponse({
          total: companies.length,
          groups: companies.map((main) => ({ main, branches: [] })),
        })
      )
    }
    if (url === '/api/sources') {
      return Promise.resolve(jsonResponse([]))
    }
    if (url === '/api/config/discovery' && method === 'GET') {
      // Read-only mode seeds Focus from this response (App.tsx's seed effect). Give it a
      // concrete scope so the seed's effect on rendered state is observable, not just the fetch.
      return Promise.resolve(
        jsonResponse(
          options.readOnly
            ? { municipalities: [], fylker: ['34'], allOfNorway: false }
            : { municipalities: [], fylker: [], allOfNorway: true }
        )
      )
    }
    if (url === '/api/kommuner') {
      return Promise.resolve(jsonResponse([]))
    }
    if (url === '/api/config/discovery' && method === 'PUT') {
      if (options.putFails) {
        return Promise.resolve(
          new Response(JSON.stringify({ title: 'Kunne ikke skrive hugin.json' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          })
        )
      }
      return Promise.resolve(jsonResponse({ municipalities: [], fylker: [], allOfNorway: true }))
    }
    if (url === '/api/config/focus' && method === 'GET') {
      return Promise.resolve(jsonResponse({ naeringskoder: ['62'], keywords: [] }))
    }
    if (url === '/api/sync' && method === 'POST') {
      return Promise.resolve(new Response(null, { status: 202 }))
    }
    if (url === '/api/first-run-dismissed' && method === 'POST') {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.reject(new Error(`unhandled request ${url}`))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  // Nav clicks push real history entries; reset the URL so the next test's App doesn't
  // boot into whichever view the previous test navigated to.
  window.history.replaceState(null, '', '/')
  // App now reads FocusProvider's stored focus (localStorage 'hugin-focus') to decide whether
  // to render FirstRunDialog. Clear it so a later test's App doesn't inherit a prior test's
  // saved (or absent) choice. Existing tests above run with no stored focus, so the dialog
  // renders behind them; that's expected (see the App-level tests below) and doesn't disturb
  // these assertions since jsdom's <dialog> polyfill has no real modal focus trap.
  window.localStorage.removeItem('hugin-focus')
})

describe('App', () => {
  it('renders five nav links with Dashbord active by default', async () => {
    vi.stubGlobal('fetch', fakeServer())
    render(<App />)

    const nav = await screen.findByRole('navigation', { name: 'Hovedmeny' })
    const buttons = screen.getAllByRole('link', {
      name: /Dashbord|Søknader|Bedrifter|Eksport|Innstillinger/,
    })
    expect(buttons).toHaveLength(5)
    expect(nav).toBeInTheDocument()

    const dashbord = screen.getByRole('link', { name: 'Dashbord' })
    expect(dashbord).toHaveAttribute('aria-current', 'page')
  })

  it('moves aria-current to Søknader when clicked', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Søknader' }))

    expect(screen.getByRole('link', { name: 'Søknader' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashbord' })).not.toHaveAttribute('aria-current')
  })

  it('switches to English from the topbar: labels change, <html lang> and localStorage update', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    // The language toggle sits in the topbar beside the theme toggle as a globe icon; its
    // name (and tooltip) says the language it switches TO.
    const enButton = await screen.findByRole('button', { name: 'Switch to English' })
    expect(enButton).toHaveAttribute('title', 'Switch to English')
    expect(enButton.querySelector('svg')).not.toBeNull()

    await user.click(enButton)

    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashbord' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Applications' })).toBeInTheDocument()
    // Once in English the same button offers the way back.
    expect(screen.getByRole('button', { name: 'Bytt til norsk' })).toHaveAttribute(
      'title',
      'Bytt til norsk'
    )
    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('hugin-lang')).toBe('en')
  })

  it('toggles the theme between dark and light, persisting the choice to localStorage', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    const themeButton = await screen.findByRole('button', { name: 'Bytt til lyst tema' })
    expect(document.documentElement.dataset.theme).not.toBe('light')

    await user.click(themeButton)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Bytt til mørkt tema' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bytt til mørkt tema' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('keeps the Bedrifter filters in the URL, so Back brings them back after leaving the view', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))
    await user.type(await screen.findByLabelText('Søk'), 'Acme')
    await waitFor(() => expect(window.location.search).toBe('?q=Acme'))

    await user.click(screen.getByRole('link', { name: 'Eksport' }))
    expect(screen.queryByLabelText('Søk')).not.toBeInTheDocument()

    act(() => window.history.back())
    expect(await screen.findByLabelText('Søk')).toHaveValue('Acme')
  })

  it('returns to Bedrifter through the nav with its filters still set', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))
    await user.type(await screen.findByLabelText('Søk'), 'Acme')
    await waitFor(() => expect(window.location.search).toBe('?q=Acme'))

    await user.click(screen.getByRole('link', { name: 'Eksport' }))
    await user.click(screen.getByRole('link', { name: 'Bedrifter' }))

    expect(await screen.findByLabelText('Søk')).toHaveValue('Acme')
    expect(window.location.search).toBe('?q=Acme')
  })

  it('keeps the typed search filter after toggling the language (the filter lives in the URL)', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))
    const search = await screen.findByLabelText('Søk')
    await user.type(search, 'Acme')
    expect(search).toHaveValue('Acme')

    await user.click(screen.getByRole('button', { name: 'Switch to English' }))

    expect(screen.getByLabelText('Search')).toHaveValue('Acme')

    await user.click(screen.getByRole('button', { name: 'Bytt til norsk' }))

    expect(screen.getByLabelText('Søk')).toHaveValue('Acme')
  })

  it('clicking a nav entry pushes history so the URL reflects the view', async () => {
    vi.stubGlobal('fetch', fakeServer())
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))

    expect(window.location.pathname).toBe('/companies')
  })

  it('Back and Forward move between views and the URL follows', async () => {
    vi.stubGlobal('fetch', fakeServer())
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('link', { name: 'Bedrifter' }))
    await screen.findByLabelText('Søk')
    expect(window.location.pathname).toBe('/companies')

    act(() => window.history.back())
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dashbord' })).toHaveAttribute('aria-current', 'page')
    )
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByLabelText('Søk')).not.toBeInTheDocument()

    act(() => window.history.forward())
    expect(await screen.findByLabelText('Søk')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/companies')
  })

  it('sends an unknown path to the dashboard', async () => {
    vi.stubGlobal('fetch', fakeServer())
    window.history.replaceState(null, '', '/no/such/page')
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(await screen.findByRole('link', { name: 'Dashbord' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('deep-loads straight into a company detail from /companies/<orgnr>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/api/companies?')) {
          return Promise.resolve(
            jsonResponse({
              total: 1,
              groups: [{ main: { orgnr: '715787630', name: 'Acme AS' }, branches: [] }],
            })
          )
        }
        if (url === '/api/companies/715787630') {
          return Promise.resolve(
            jsonResponse({ company: { orgnr: '715787630', name: 'Acme AS' }, ads: [] })
          )
        }
        return Promise.reject(new Error(`unhandled request ${url}`))
      })
    )
    window.history.replaceState(null, '', '/companies/715787630')

    render(<App />)

    expect(await screen.findByRole('link', { name: 'Bedrifter' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/companies/715787630')
  })

  it('the Bedrifter nav link leads from a company detail back to the list, filters kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.startsWith('/api/companies?')) {
          return Promise.resolve(
            jsonResponse({
              total: 1,
              groups: [{ main: { orgnr: '715787630', name: 'Acme AS' }, branches: [] }],
            })
          )
        }
        if (url === '/api/companies/715787630') {
          return Promise.resolve(
            jsonResponse({ company: { orgnr: '715787630', name: 'Acme AS' }, ads: [] })
          )
        }
        return Promise.reject(new Error(`unhandled request ${url}`))
      })
    )
    window.history.replaceState(null, '', '/companies/715787630?q=Acme')
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Bedrifter' }))

    await waitFor(() => expect(window.location.pathname).toBe('/companies'))
    expect(window.location.search).toBe('?q=Acme')
    expect(screen.queryByRole('heading', { name: 'Acme AS' })).not.toBeInTheDocument()
  })

  it('read-only: shows the demo banner and never opens the first-run dialog', async () => {
    vi.stubGlobal('fetch', fakeServer({ readOnly: true }))
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Demo' })).toHaveTextContent(
        'Skrivebeskyttet demo. Ekte stillinger og selskaper fra NAV og Brreg for Innlandet, pluss tre fiktive firmaer'
      )
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kildekode på GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/malinfossum/hugin'
    )
  })

  it('read-only: the English banner names the fictional companies', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    vi.stubGlobal('fetch', fakeServer({ readOnly: true }))
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Demo' })).toHaveTextContent(
        'Read-only demo. Real job ads and companies from NAV and Brreg for Innlandet, plus three fictional companies'
      )
    )
  })

  it('read-only: seeds the focus from the server scope instead of asking', async () => {
    const fetchMock = fakeServer({
      readOnly: true,
      companies: [
        { orgnr: '1', name: 'Innlandet AS', kommune: '3403' },
        { orgnr: '2', name: 'Oslo AS', kommune: '0301' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/config/discovery', undefined))
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()

    // The seed is session-only state, not a side effect on its own. Prove it actually reached
    // the app's Focus context by reading it back from a view that filters by it: Bedrifter asks
    // the server for the seeded fylke ('34' = Innlandet, from the fake server's discovery
    // config), not the unset default (which would send no region at all).
    await user.click(screen.getByRole('link', { name: 'Bedrifter' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u]) => String(u).startsWith('/api/companies?') && String(u).includes('fylker=34')
        )
      ).toBe(true)
    )
  })

  it('keeps the first-run dialog closed until /api/status has answered, then opens it locally', async () => {
    vi.stubGlobal('fetch', fakeServer({ readOnly: false }))
    render(<App />)
    // Synchronous first render: status still pending → no dialog yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Demo' })).not.toBeInTheDocument()
  })

  it('never opens the first-run dialog when /api/status fails', async () => {
    const fetchMock = fakeServer({ statusFails: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/status', undefined))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('App first-run focus dialog', () => {
  it('renders the dialog when no focus is stored', async () => {
    vi.stubGlobal('fetch', fakeServer())
    render(<App />)

    expect(await screen.findByRole('dialog', { name: 'Hva vil du følge?' })).toBeVisible()
  })

  it('does not render the dialog when a valid focus is already stored', () => {
    vi.stubGlobal('fetch', fakeServer())
    window.localStorage.setItem(
      'hugin-focus',
      JSON.stringify({ v: 1, fylke: null, kommune: null, categories: [] })
    )

    render(<App />)

    expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
  })

  it('the first-run dialog opens again when the server has no scope, even with a valid focus already stored (v3.5 Part A3)', async () => {
    vi.stubGlobal('fetch', fakeServer({ scopeConfigured: false }))
    window.localStorage.setItem(
      'hugin-focus',
      JSON.stringify({ v: 1, fylke: '34', kommune: null, categories: [] })
    )

    render(<App />)

    expect(await screen.findByRole('dialog', { name: 'Hva vil du følge?' })).toBeInTheDocument()
  })

  it('completing that same dialog actually closes it: scopeConfigured is a live value, not the boot-time snapshot (Task 11 finding 1)', async () => {
    const fetchMock = fakeServer({ scopeConfigured: false })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('dialog', { name: 'Hva vil du følge?' })
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.click(screen.getByRole('button', { name: 'Start' }))

    // Without the fix, `scopeConfigured === false` never stops being true (it's the frozen
    // boot-time fetch, and this fake server always answers false), so the dialog reopens right
    // after Start closes it. That is the fresh-install path this whole feature exists for.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
    )
    // Nor did the user dismiss it via Escape. Start is what closed it.
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) =>
          u === '/api/first-run-dismissed' && (i as RequestInit | undefined)?.method === 'POST'
      )
    ).toBe(false)
  })

  it('stays closed for the rest of the session after an Esc-dismiss', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    const dialog = await screen.findByRole('dialog', { name: 'Hva vil du følge?' })
    act(() => {
      dialog.dispatchEvent(new Event('close'))
    })

    expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
    // Dismissing is session-only. Nothing gets persisted, so a fresh mount (next launch)
    // would show the prompt again. Confirmed indirectly: no 'hugin-focus' key was written.
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()
    // Also releases a held boot sync on a fresh install (a mutation, so it goes out a tick later).
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            u === '/api/first-run-dismissed' && (i as RequestInit | undefined)?.method === 'POST'
        )
      ).toBe(true)
    )
  })

  it('saving a focus choice closes the dialog and persists it', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('dialog', { name: 'Hva vil du følge?' })
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
    )
    expect(JSON.parse(window.localStorage.getItem('hugin-focus') as string)).toEqual({
      v: 2,
      regions: [{ fylke: '34', kommuner: [] }],
      categories: [],
    })
  })

  it('a failed first-run save keeps the dialog open and stores nothing, so it returns next launch', async () => {
    vi.stubGlobal('fetch', fakeServer({ putFails: true }))
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('dialog', { name: 'Hva vil du følge?' })
    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('dialog', { name: 'Hva vil du følge?' })).toBeInTheDocument()
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()
  })

  it('moves focus to the app heading once the dialog closes after Start', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Start' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
    )
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Hugin' }))
  })
})
