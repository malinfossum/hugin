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
 * unstored) — a bare, no-scope-chosen response set so the dialog's own suite (FirstRunDialog.test.tsx)
 * carries the interesting scope/kommune scenarios. */
function fakeServer(
  options: { putFails?: boolean; readOnly?: boolean; statusFails?: boolean } = {}
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
        })
      )
    }
    if (url === '/api/companies') {
      return Promise.resolve(jsonResponse([]))
    }
    if (url === '/api/sources') {
      return Promise.resolve(jsonResponse([]))
    }
    if (url === '/api/config/discovery' && method === 'GET') {
      // Read-only mode seeds Focus from this response (App.tsx's seed effect) — give it a
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
  // to render FirstRunDialog — clear it so a later test's App doesn't inherit a prior test's
  // saved (or absent) choice. Existing tests above run with no stored focus, so the dialog
  // renders behind them; that's expected (see the App-level tests below) and doesn't disturb
  // these assertions since jsdom's <dialog> polyfill has no real modal focus trap.
  window.localStorage.removeItem('hugin-focus')
})

describe('App', () => {
  it('renders five nav buttons with Dashbord active by default', () => {
    vi.stubGlobal('fetch', fakeServer())
    render(<App />)

    const nav = screen.getByRole('navigation', { name: 'Hovedmeny' })
    const buttons = screen.getAllByRole('button', {
      name: /Dashbord|Søknader|Bedrifter|Eksport|Innstillinger/,
    })
    expect(buttons).toHaveLength(5)
    expect(nav).toBeInTheDocument()

    const dashbord = screen.getByRole('button', { name: 'Dashbord' })
    expect(dashbord).toHaveAttribute('aria-current', 'page')
  })

  it('moves aria-current to Søknader when clicked', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Søknader' }))

    expect(screen.getByRole('button', { name: 'Søknader' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Dashbord' })).not.toHaveAttribute('aria-current')
  })

  it('switches to English via Settings: labels change, <html lang> and localStorage update', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    // The language toggle lives in Settings only — the header carries just nav + theme.
    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Innstillinger' }))

    const noButton = screen.getByRole('button', { name: 'NO' })
    const enButton = screen.getByRole('button', { name: 'EN' })
    expect(noButton).toHaveAttribute('aria-pressed', 'true')
    expect(enButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(enButton)

    expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dashbord' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Applications' })).toBeInTheDocument()
    expect(enButton).toHaveAttribute('aria-pressed', 'true')
    expect(noButton).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('hugin-lang')).toBe('en')
  })

  it('toggles the theme between dark and light, persisting the choice to localStorage', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    const themeButton = screen.getByRole('button', { name: 'Bytt til lyst tema' })
    expect(document.documentElement.dataset.theme).not.toBe('light')

    await user.click(themeButton)

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('theme')).toBe('light')
    expect(screen.getByRole('button', { name: 'Bytt til mørkt tema' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Bytt til mørkt tema' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('keeps a view mounted (hidden, not unmounted) when switching away and back', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bedrifter' }))
    const search = await screen.findByLabelText('Søk')
    await user.type(search, 'Acme')
    expect(search).toHaveValue('Acme')

    await user.click(screen.getByRole('button', { name: 'Eksport' }))
    expect(screen.getByLabelText('Søk')).not.toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Bedrifter' }))
    expect(screen.getByLabelText('Søk')).toHaveValue('Acme')
  })

  it('keeps the typed search filter after toggling the language (keep-mounted state survives re-render)', async () => {
    vi.stubGlobal('fetch', fakeServer())
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bedrifter' }))
    const search = await screen.findByLabelText('Søk')
    await user.type(search, 'Acme')
    expect(search).toHaveValue('Acme')

    await user.click(screen.getByRole('button', { name: 'Innstillinger' }))
    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByLabelText('Search')).toHaveValue('Acme')

    await user.click(screen.getByRole('button', { name: 'NO' }))

    expect(screen.getByLabelText('Søk')).toHaveValue('Acme')
  })

  it('clicking a nav entry pushes history so the URL reflects the view', async () => {
    vi.stubGlobal('fetch', fakeServer())
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bedrifter' }))

    expect(window.location.pathname).toBe('/companies')
  })

  it('Back (popstate) returns to the previous view and keeps the other mounted-hidden', async () => {
    vi.stubGlobal('fetch', fakeServer())
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Bedrifter' }))
    const search = await screen.findByLabelText('Søk')
    await user.type(search, 'Acme')
    expect(window.location.pathname).toBe('/companies')

    // Simulate Back deterministically instead of relying on jsdom's async history traversal:
    // set the URL directly, then fire the same popstate event the real browser would dispatch.
    window.history.replaceState(null, '', '/')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('button', { name: 'Dashbord' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Søk')).not.toBeVisible()
    expect(screen.getByLabelText('Søk')).toHaveValue('Acme')
  })

  it('deep-loads straight into a company detail from /companies/<orgnr>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url === '/api/companies') {
          return Promise.resolve(jsonResponse([{ orgnr: '915787630', name: 'Acme AS' }]))
        }
        if (url === '/api/companies/915787630') {
          return Promise.resolve(
            jsonResponse({ company: { orgnr: '915787630', name: 'Acme AS' }, ads: [] })
          )
        }
        return Promise.reject(new Error(`unhandled request ${url}`))
      })
    )
    window.history.replaceState(null, '', '/companies/915787630')

    render(<App />)

    expect(screen.getByRole('button', { name: 'Bedrifter' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(await screen.findByRole('heading', { name: 'Acme AS' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/companies/915787630')
  })

  it('read-only: shows the demo banner and never opens the first-run dialog', async () => {
    vi.stubGlobal('fetch', fakeServer({ readOnly: true }))
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Demo' })).toHaveTextContent(
        'Demo — skrivebeskyttet'
      )
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kildekode på GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/malinfossum/hugin'
    )
  })

  it('read-only: seeds the focus from the server scope instead of asking', async () => {
    const fetchMock = fakeServer({ readOnly: true })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/config/discovery', undefined))
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()

    // The seed is session-only state, not a side effect on its own — prove it actually reached
    // the app's Focus context by reading it back from a view that renders it: Settings' focus
    // Fylke select (disambiguated from CoverageSection's own Fylke select by id) should show the
    // fylke the fake server's discovery config carried ('34' = Innlandet), not the unset default.
    await user.click(screen.getByRole('button', { name: 'Innstillinger' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Fylke', { selector: '#settings-focus-fylke' })).toHaveValue(
        '34'
      )
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

  it('stays closed for the rest of the session after an Esc-dismiss', async () => {
    const fetchMock = fakeServer()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    const dialog = await screen.findByRole('dialog', { name: 'Hva vil du følge?' })
    act(() => {
      dialog.dispatchEvent(new Event('close'))
    })

    expect(screen.queryByRole('dialog', { name: 'Hva vil du følge?' })).not.toBeInTheDocument()
    // Dismissing is session-only — nothing gets persisted, so a fresh mount (next launch)
    // would show the prompt again. Confirmed indirectly: no 'hugin-focus' key was written.
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()
    // Also releases a held boot sync on a fresh install.
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) =>
          u === '/api/first-run-dismissed' && (i as RequestInit | undefined)?.method === 'POST'
      )
    ).toBe(true)
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
      v: 1,
      fylke: '34',
      kommune: null,
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
