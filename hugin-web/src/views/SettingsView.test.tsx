import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { FocusProvider, loadFocus, saveFocus } from '../focus'
import { LanguageProvider, useLang } from '../i18n'
import type { DiscoveryConfigDto, KommuneDto, SourceDto } from '../types'
import { SettingsView } from './SettingsView'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function source(overrides: Partial<SourceDto> = {}): SourceDto {
  return { id: 1, label: 'FINN', url: 'https://finn.no', position: 0, ...overrides }
}

const DEFAULT_DISCOVERY: DiscoveryConfigDto = {
  municipalities: [{ name: 'Hamar', number: '3403' }],
  fylker: [],
  allOfNorway: false,
}

const DEFAULT_KOMMUNER: KommuneDto[] = [
  { number: '3403', name: 'Hamar' },
  { number: '3405', name: 'Lillehammer' },
]

/** Fake server backing full Sources CRUD: GET list, POST add, PUT edit, POST reorder, DELETE —
 * plus the discovery-config trio (GET/PUT /api/config/discovery, GET /api/kommuner,
 * POST /api/sync) the Dekning section always fetches on mount, in every scenario. Pass `null`
 * as seed to make GET /api/sources reject (load-failure scenarios). `discovery`/`kommuner` seed
 * the Dekning section, `kommunerDown` makes GET /api/kommuner fail (the fylke-only degraded
 * mode), and `putStatus` makes the PUT fail with that status instead of echoing `discovery`
 * back; `syncStatus` makes POST /api/sync answer with that status (409 = one already runs).
 * Returns `{ fetchMock, puts }` — `puts` records every PUT /api/config/discovery body. */
function fakeServer(
  seed: SourceDto[] | null,
  options: {
    discovery?: DiscoveryConfigDto
    kommuner?: KommuneDto[]
    kommunerDown?: boolean
    kommunerPending?: boolean
    putStatus?: number
    syncStatus?: number
    /** Successive `units` counts GET /api/config/focus/preview?nace=62 answers with, one per
     * call — the last value repeats once exhausted. Lets a test tell a fresh Brreg fetch apart
     * from a cached one (Task 11 ruling 2). */
    focusPreviewUnits?: number[]
  } = {}
) {
  let entries = (seed ?? []).map((s) => ({ ...s }))
  let nextId = Math.max(0, ...entries.map((s) => s.id)) + 1
  const discovery = options.discovery ?? DEFAULT_DISCOVERY
  const kommuner = options.kommuner ?? DEFAULT_KOMMUNER
  const puts: unknown[] = []
  const focusPreviewUnits = options.focusPreviewUnits ?? [45]
  let focusPreviewCalls = 0

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'

    if (url === '/api/config/discovery' && method === 'GET') {
      return Promise.resolve(jsonResponse(discovery))
    }
    if (url === '/api/config/discovery' && method === 'PUT') {
      puts.push(JSON.parse(init?.body as string))
      if (options.putStatus) {
        return Promise.resolve(
          jsonResponse({ title: 'Kunne ikke skrive hugin.json' }, { status: options.putStatus })
        )
      }
      return Promise.resolve(jsonResponse(discovery))
    }
    if (url === '/api/kommuner' && method === 'GET') {
      if (options.kommunerPending) return new Promise<Response>(() => {})
      if (options.kommunerDown) {
        return Promise.resolve(jsonResponse({ title: 'Registeret er nede' }, { status: 503 }))
      }
      return Promise.resolve(jsonResponse(kommuner))
    }
    if (url === '/api/config/focus' && method === 'GET') {
      return Promise.resolve(jsonResponse({ naeringskoder: ['62'], keywords: [] }))
    }
    if (url.startsWith('/api/config/focus/preview') && method === 'GET') {
      const units = focusPreviewUnits[Math.min(focusPreviewCalls, focusPreviewUnits.length - 1)]
      focusPreviewCalls += 1
      return Promise.resolve(jsonResponse({ code: '62', name: 'IT-tjenester', units }))
    }
    if (url === '/api/status' && method === 'GET') {
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
    if (url === '/api/reset' && method === 'POST') {
      const body = JSON.parse(init?.body as string)
      return Promise.resolve(jsonResponse({ mode: body.mode, snapshotPath: null }))
    }
    if (url === '/api/sync' && method === 'POST') {
      if (options.syncStatus) {
        return Promise.resolve(
          jsonResponse({ title: 'En synk kjører allerede' }, { status: options.syncStatus })
        )
      }
      return Promise.resolve(jsonResponse(undefined, { status: 202 }))
    }
    if (url === '/api/sources' && method === 'GET') {
      if (seed === null) return Promise.reject(new Error('network down'))
      return Promise.resolve(jsonResponse([...entries].sort((a, b) => a.position - b.position)))
    }
    if (url === '/api/sources' && method === 'POST') {
      const body = JSON.parse(init?.body as string)
      const created: SourceDto = {
        id: nextId++,
        label: body.label,
        url: body.url,
        position: entries.length,
      }
      entries.push(created)
      return Promise.resolve(jsonResponse(created))
    }
    if (url === '/api/sources/reorder' && method === 'POST') {
      const body = JSON.parse(init?.body as string) as { ids: number[] }
      entries = body.ids.map((id, index) => {
        const found = entries.find((e) => e.id === id)
        if (!found) throw new Error(`unknown id ${id}`)
        return { ...found, position: index }
      })
      return Promise.resolve(jsonResponse(undefined, { status: 204 }))
    }
    const putMatch = url.match(/^\/api\/sources\/(\d+)$/)
    if (putMatch && method === 'PUT') {
      const id = Number(putMatch[1])
      const target = entries.find((e) => e.id === id)
      if (!target) return Promise.resolve(jsonResponse({ title: 'Not found' }, { status: 404 }))
      const body = JSON.parse(init?.body as string)
      target.label = body.label
      target.url = body.url
      return Promise.resolve(jsonResponse(target))
    }
    if (putMatch && method === 'DELETE') {
      const id = Number(putMatch[1])
      entries = entries.filter((e) => e.id !== id)
      return Promise.resolve(jsonResponse(undefined, { status: 204 }))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  return { fetchMock, puts }
}

/** Stand-in for the topbar language toggle: the real one lives in App, outside this view, so a
 * sibling under the same LanguageProvider is what a language switch looks like from here. */
function LangSwitch() {
  const [, setLang] = useLang()
  return (
    <button type="button" onClick={() => setLang('en')}>
      Switch to English
    </button>
  )
}

function renderView(
  fetchMock: ReturnType<typeof vi.fn>,
  props: Partial<{ onSourcesChanged: () => void; withLangSwitch: boolean }> = {}
) {
  vi.stubGlobal('fetch', fetchMock)
  const onSourcesChanged = props.onSourcesChanged ?? vi.fn()
  const utils = render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FocusProvider>
          {props.withLangSwitch && <LangSwitch />}
          <SettingsView onSourcesChanged={onSourcesChanged} />
        </FocusProvider>
      </LiveRegionProvider>
    </LanguageProvider>
  )
  return { ...utils, onSourcesChanged }
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('SettingsView', () => {
  it('lists fetched sources in order', async () => {
    const entries = [
      source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }),
      source({ id: 2, label: 'LinkedIn', url: 'https://linkedin.com', position: 1 }),
    ]
    renderView(fakeServer(entries).fetchMock)

    await screen.findByText('FINN')
    const links = screen.getAllByRole('link', { name: /FINN|LinkedIn/ })
    expect(links.map((l) => l.textContent)).toEqual(['FINN', 'LinkedIn'])
  })

  it('add form POSTs {label, url} and calls onSourcesChanged', async () => {
    const user = userEvent.setup()
    const { fetchMock } = fakeServer([])
    const { onSourcesChanged } = renderView(fetchMock)

    await screen.findByRole('button', { name: 'Legg til lenke' })
    await user.type(screen.getByLabelText('Etikett'), 'Vitae')
    await user.type(screen.getByLabelText('URL'), 'https://vitae.no')
    await user.click(screen.getByRole('button', { name: 'Legg til lenke' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sources',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ label: 'Vitae', url: 'https://vitae.no' }),
        })
      )
    })
    await waitFor(() => expect(onSourcesChanged).toHaveBeenCalled())
    // Outcome, not just the request: the refetched list must actually show the new row.
    expect(await screen.findByText('Vitae')).toBeInTheDocument()
  })

  it('edit switches a row to inputs and PUTs', async () => {
    const user = userEvent.setup()
    const entries = [source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 })]
    const { fetchMock } = fakeServer(entries)
    const { onSourcesChanged } = renderView(fetchMock)

    await screen.findByText('FINN')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))

    const editForm = screen.getByRole('button', { name: 'Lagre' }).closest('form')
    if (!editForm) throw new Error('edit form not found')

    const labelInput = within(editForm).getByLabelText('Etikett')
    await user.clear(labelInput)
    await user.type(labelInput, 'FINN.no')
    await user.click(within(editForm).getByRole('button', { name: 'Lagre' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sources/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ label: 'FINN.no', url: 'https://finn.no' }),
        })
      )
    })
    await waitFor(() => expect(onSourcesChanged).toHaveBeenCalled())
    // Outcome, not just the request: the row reverts to view mode showing the new label,
    // and the stale label is gone.
    expect(await screen.findByText('FINN.no')).toBeInTheDocument()
    expect(screen.queryByText('FINN')).not.toBeInTheDocument()
  })

  it('remove opens ConfirmDialog, confirm DELETEs', async () => {
    const user = userEvent.setup()
    const entries = [source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 })]
    const { fetchMock } = fakeServer(entries)
    const { onSourcesChanged } = renderView(fetchMock)

    await screen.findByText('FINN')
    await user.click(screen.getByRole('button', { name: 'Fjern' }))

    expect(await screen.findByText('Fjerne «FINN»?')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'Fjerne «FINN»?' })
    await user.click(within(dialog).getByRole('button', { name: 'Fjern' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sources/1',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
    await waitFor(() => expect(onSourcesChanged).toHaveBeenCalled())
    // Outcome, not just the request: the removed row is actually gone after the refetch.
    await waitFor(() => expect(screen.queryByText('FINN')).not.toBeInTheDocument())
  })

  it('move-down on the first row POSTs /api/sources/reorder with the swapped id order', async () => {
    const user = userEvent.setup()
    const entries = [
      source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }),
      source({ id: 2, label: 'LinkedIn', url: 'https://linkedin.com', position: 1 }),
    ]
    const { fetchMock } = fakeServer(entries)
    const { onSourcesChanged } = renderView(fetchMock)

    await screen.findByText('FINN')
    const moveDownButtons = screen.getAllByRole('button', { name: 'Flytt ned' })
    await user.click(moveDownButtons[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sources/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ ids: [2, 1] }),
        })
      )
    })
    await waitFor(() => expect(onSourcesChanged).toHaveBeenCalled())
    // Outcome, not just the request: the refetched list must actually render in the new order.
    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /FINN|LinkedIn/ })
      expect(links.map((l) => l.textContent)).toEqual(['LinkedIn', 'FINN'])
    })
  })

  it('move-up disabled on first row, move-down disabled on last', async () => {
    const entries = [
      source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }),
      source({ id: 2, label: 'LinkedIn', url: 'https://linkedin.com', position: 1 }),
    ]
    renderView(fakeServer(entries).fetchMock)

    await screen.findByText('FINN')
    const moveUpButtons = screen.getAllByRole('button', { name: 'Flytt opp' })
    const moveDownButtons = screen.getAllByRole('button', { name: 'Flytt ned' })

    expect(moveUpButtons[0]).toBeDisabled()
    expect(moveDownButtons[0]).not.toBeDisabled()
    expect(moveUpButtons[1]).not.toBeDisabled()
    expect(moveDownButtons[1]).toBeDisabled()
  })

  it('carries no language or theme controls — both live in the topbar', async () => {
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('button', { name: 'Legg til lenke' })
    expect(screen.queryByRole('region', { name: 'Språk' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Tema' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bytt til lyst tema' })).not.toBeInTheDocument()
  })

  it('shows a load error with retry on GET failure, and recovers on retry', async () => {
    const user = userEvent.setup()
    renderView(fakeServer(null).fetchMock)

    expect(await screen.findByText('Kunne ikke laste kilder.')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Prøv igjen' })

    vi.stubGlobal(
      'fetch',
      fakeServer([source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 })]).fetchMock
    )
    await user.click(retry)

    await waitFor(() => {
      expect(screen.queryByText('Kunne ikke laste kilder.')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('FINN')).toBeInTheDocument()
  })

  it('announces after a successful add', async () => {
    const user = userEvent.setup()
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('button', { name: 'Legg til lenke' })
    await user.type(screen.getByLabelText('Etikett'), 'Vitae')
    await user.type(screen.getByLabelText('URL'), 'https://vitae.no')
    await user.click(screen.getByRole('button', { name: 'Legg til lenke' }))

    await screen.findByText('Vitae')
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Kilde lagt til.')
    })
  })

  it('announces after a successful edit', async () => {
    const user = userEvent.setup()
    const entries = [source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 })]
    renderView(fakeServer(entries).fetchMock)

    await screen.findByText('FINN')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))

    const editForm = screen.getByRole('button', { name: 'Lagre' }).closest('form')
    if (!editForm) throw new Error('edit form not found')
    await user.click(within(editForm).getByRole('button', { name: 'Lagre' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lagre' })).toBeNull())
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Kilde lagret.')
    })
  })

  it('announces after a successful remove', async () => {
    const user = userEvent.setup()
    const entries = [source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 })]
    renderView(fakeServer(entries).fetchMock)

    await screen.findByText('FINN')
    await user.click(screen.getByRole('button', { name: 'Fjern' }))
    const dialog = screen.getByRole('dialog', { name: 'Fjerne «FINN»?' })
    await user.click(within(dialog).getByRole('button', { name: 'Fjern' }))

    await waitFor(() => expect(screen.queryByText('FINN')).not.toBeInTheDocument())
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Kilde fjernet.')
    })
  })

  it('announces after a successful reorder', async () => {
    const user = userEvent.setup()
    const entries = [
      source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }),
      source({ id: 2, label: 'LinkedIn', url: 'https://linkedin.com', position: 1 }),
    ]
    renderView(fakeServer(entries).fetchMock)

    await screen.findByText('FINN')
    const moveDownButtons = screen.getAllByRole('button', { name: 'Flytt ned' })
    await user.click(moveDownButtons[0])

    await waitFor(() => {
      const links = screen.getAllByRole('link', { name: /FINN|LinkedIn/ })
      expect(links.map((l) => l.textContent)).toEqual(['LinkedIn', 'FINN'])
    })
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Rekkefølge endret.')
    })
  })

  it('toggling a Visningsfilter category checkbox persists it and preserves the stored region', async () => {
    const user = userEvent.setup()
    saveFocus({ regions: [{ fylke: '34', kommuner: [] }], categories: [] })
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('heading', { name: 'Visningsfilter' })
    await user.click(screen.getByRole('checkbox', { name: 'Utvikling' }))

    expect(loadFocus()).toEqual({
      regions: [{ fylke: '34', kommuner: [] }],
      categories: ['Utvikling'],
    })
  })

  it('reset button announces and clears the stored focus', async () => {
    const user = userEvent.setup()
    saveFocus({ regions: [{ fylke: '34', kommuner: [] }], categories: ['Utvikling'] })
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('heading', { name: 'Visningsfilter' })
    await user.click(screen.getByRole('button', { name: 'Vis oppstartsvalget igjen' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Oppstartsvalget vises ved neste start.')
    })
    expect(loadFocus()).toBeNull()
  })

  it('renders a Visningsfilter heading with the category fieldset and no region selects', async () => {
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    expect(within(section).queryByLabelText('Fylke')).not.toBeInTheDocument()
    expect(within(section).queryByLabelText('Kommune')).not.toBeInTheDocument()
    const fieldset = within(section).getByRole('group', { name: 'Kategorier' })
    expect(within(fieldset).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('shows the stored regions as chips named from /api/kommuner, plus «Velg områder …»', async () => {
    saveFocus({
      regions: [
        { fylke: '34', kommuner: ['3403'] },
        { fylke: '39', kommuner: [] },
      ],
      categories: [],
    })
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    await waitFor(() => expect(within(section).getByText('Innlandet: Hamar')).toBeInTheDocument())
    expect(within(section).getByText('Vestfold: hele fylket')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Velg områder …' })).toBeInTheDocument()
  })

  it('chip ✕ removes that region at once, announces, and persists', async () => {
    const user = userEvent.setup()
    saveFocus({
      regions: [
        { fylke: '34', kommuner: [] },
        { fylke: '39', kommuner: [] },
      ],
      categories: ['Utvikling'],
    })
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    await user.click(within(section).getByRole('button', { name: 'Fjern Innlandet' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent('Fokus oppdatert.'))
    expect(loadFocus()).toEqual({
      regions: [{ fylke: '39', kommuner: [] }],
      categories: ['Utvikling'],
    })
    expect(within(section).queryByText(/^Innlandet/)).not.toBeInTheDocument()
  })

  it('«Velg områder …» opens the picker; Bruk applies, announces, closes, and keeps the categories', async () => {
    const user = userEvent.setup()
    saveFocus({ regions: [], categories: ['Utvikling'] })
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    expect(within(section).getByText('Hele Norge')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Velg områder …' }))

    const dialog = await screen.findByRole('dialog', { name: 'Velg områder' })
    await user.click(within(dialog).getByRole('button', { name: 'Vis kommuner i Innlandet' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(dialog).getByRole('button', { name: 'Bruk' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Velg områder' })).not.toBeInTheDocument()
    )
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent('Fokus oppdatert.'))
    expect(loadFocus()).toEqual({
      regions: [{ fylke: '34', kommuner: ['3405'] }],
      categories: ['Utvikling'],
    })
    expect(within(section).getByText('Innlandet: Lillehammer')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Velg områder …' })).toHaveFocus()
  })

  it('Avbryt discards the draft and announces nothing', async () => {
    const user = userEvent.setup()
    saveFocus({ regions: [], categories: [] })
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    await user.click(within(section).getByRole('button', { name: 'Velg områder …' }))
    const dialog = await screen.findByRole('dialog', { name: 'Velg områder' })
    await user.click(within(dialog).getByRole('checkbox', { name: 'Vestfold' }))
    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Velg områder' })).not.toBeInTheDocument()
    )
    expect(loadFocus()).toEqual({ regions: [], categories: [] })
    expect(within(section).getByText('Hele Norge')).toBeInTheDocument()
    // announce() posts after a 50 ms timer — give it that window, then assert silence.
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('')
  })

  it('fetches the kommune register once, even when the picker opens twice', async () => {
    const user = userEvent.setup()
    const { fetchMock } = fakeServer([])
    renderView(fetchMock)
    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    await screen.findByRole('region', { name: 'Dekning' })
    const kommunerCalls = () =>
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/kommuner').length
    await waitFor(() => expect(kommunerCalls()).toBeGreaterThan(0))
    const before = kommunerCalls()

    await user.click(within(section).getByRole('button', { name: 'Velg områder …' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Avbryt' })
    )
    await user.click(within(section).getByRole('button', { name: 'Velg områder …' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Avbryt' })
    )

    expect(kommunerCalls()).toBe(before)
  })

  it('with the register down the chips fall back to numbers and the picker still opens', async () => {
    const user = userEvent.setup()
    saveFocus({ regions: [{ fylke: '34', kommuner: ['3403'] }], categories: [] })
    renderView(fakeServer([], { kommunerDown: true }).fetchMock)

    const section = await screen.findByRole('region', { name: 'Visningsfilter' })
    expect(within(section).getByText('Innlandet: 3403')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Velg områder …' }))

    const dialog = await screen.findByRole('dialog', { name: 'Velg områder' })
    expect(within(dialog).getByText(/Kommunelisten er ikke tilgjengelig/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Bruk' })).toBeEnabled()
  })
})

describe('Dekning (coverage)', () => {
  it('shows the current server scope with the fylke’s kommuner checked', async () => {
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Dekning' })
    expect(within(section).getByLabelText('Fylke')).toHaveValue('34')
    expect(within(section).getByRole('checkbox', { name: 'Hamar' })).toBeChecked()
    expect(within(section).getByRole('checkbox', { name: 'Lillehammer' })).not.toBeChecked()
  })

  it('Save PUTs the scope, announces, and triggers a sync', async () => {
    const server = fakeServer([])
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]).toEqual({
      municipalityNumbers: ['3403', '3405'],
      fylker: [],
      allOfNorway: false,
    })
    expect(await screen.findByText('Lagret — synkroniserer …')).toBeInTheDocument()
    expect(
      server.fetchMock.mock.calls.some(([u, i]) => u === '/api/sync' && i?.method === 'POST')
    ).toBe(true)
  })

  it('a failed save shows an alert and does not sync', async () => {
    const server = fakeServer([], { putStatus: 500 })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      /Kunne ikke lagre dekningen/
    )
    expect(
      server.fetchMock.mock.calls.some(([u, i]) => u === '/api/sync' && i?.method === 'POST')
    ).toBe(false)
  })

  it('says the new scope applies next sync when one is already running', async () => {
    // The running sync read the old scope before the save, so announcing "syncing …" would
    // promise a fetch that is not happening.
    const server = fakeServer([], { syncStatus: 409 })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    expect(await screen.findByText('Lagret — brukes ved neste synk')).toBeInTheDocument()
    expect(screen.queryByText('Lagret — synkroniserer …')).not.toBeInTheDocument()
  })

  it('saves the fylke alone when the kommune list is unavailable', async () => {
    // No checkboxes are rendered in this mode, so the prefilled kommuner are invisible and
    // un-clearable — and the API would reject numbers it cannot verify. Save the fylke.
    const server = fakeServer([], { kommunerDown: true })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })
    await within(section).findByText(/Kommunelisten er ikke tilgjengelig/)

    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]).toEqual({
      municipalityNumbers: [],
      fylker: ['34'],
      allOfNorway: false,
    })
  })

  it('a save keeps coverage outside the rendered fylke, and lists it', async () => {
    // The real hugin.json is multi-fylke (Innlandet kommuner + Larvik). The cascade renders one
    // fylke, so a save used to write only what it showed and silently dropped Larvik.
    const server = fakeServer([], {
      discovery: {
        municipalities: [
          { name: 'Hamar', number: '3403' },
          { name: 'Larvik', number: '3909' },
        ],
        fylker: [],
        allOfNorway: false,
      },
    })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    expect(
      within(section).getByRole('list', { name: 'Dekkes også, utenfor Innlandet' })
    ).toHaveTextContent('Larvik (Vestfold)')

    await user.click(within(section).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    await waitFor(() => expect(server.puts).toHaveLength(1))
    expect(server.puts[0]).toEqual({
      municipalityNumbers: ['3403', '3405', '3909'],
      fylker: [],
      allOfNorway: false,
    })
  })

  it('Save stays disabled until the kommune list has settled', async () => {
    // A save in the loading window would have gone through effectiveDraft with no list and
    // widened the scope to the fylke alone.
    const server = fakeServer([], { kommunerPending: true })
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })
    await within(section).findByLabelText('Fylke')

    expect(within(section).getByRole('button', { name: 'Lagre dekning' })).toBeDisabled()
    expect(
      within(section).queryByText(/Kommunelisten er ikke tilgjengelig/)
    ).not.toBeInTheDocument()
  })

  it('says the sync could not start when the save went through but the sync did not', async () => {
    const server = fakeServer([], { syncStatus: 500 })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))

    expect(await screen.findByText('Lagret — synken kunne ikke starte')).toBeInTheDocument()
    expect(screen.queryByText('Lagret — synkroniserer …')).not.toBeInTheDocument()
  })

  it('a coverage save resets Fokus’s preview cache — a re-previewed code fetches again instead of serving the old count (Task 11 ruling 2)', async () => {
    const server = fakeServer([], { focusPreviewUnits: [10, 20] })
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const coverageSection = await screen.findByRole('region', { name: 'Dekning' })
    const focusSection = await screen.findByRole('region', { name: 'Fokus' })

    await user.type(within(focusSection).getByLabelText('Legg til bransje'), '62')
    await user.click(within(focusSection).getByRole('button', { name: 'Vis antall' }))
    expect(
      await within(focusSection).findByText('62 · IT-tjenester — 10 bedrifter')
    ).toBeInTheDocument()

    await user.click(within(coverageSection).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(coverageSection).getByRole('button', { name: 'Lagre dekning' }))
    await screen.findByText('Lagret — synkroniserer …')

    // FocusSection is NOT remounted (Task 11 finding 2 — a remount would also discard an
    // unsaved draft): the preview endpoint has only been called once so far, invalidated
    // through a version-qualified cache key instead.
    const previewCalls = server.fetchMock.mock.calls.filter(([u]) =>
      String(u).startsWith('/api/config/focus/preview')
    )
    expect(previewCalls).toHaveLength(1)

    // Same instance, same field still holding '62' from before the save — just click Preview
    // again rather than retyping into a field a remount would have cleared.
    await user.click(within(focusSection).getByRole('button', { name: 'Vis antall' }))

    expect(
      await within(focusSection).findByText('62 · IT-tjenester — 20 bedrifter')
    ).toBeInTheDocument()
    const previewCallsAfter = server.fetchMock.mock.calls.filter(([u]) =>
      String(u).startsWith('/api/config/focus/preview')
    )
    expect(previewCallsAfter).toHaveLength(2)
  })

  it('an unsaved Fokus draft (an added bransje not yet saved) survives a coverage save (Task 11 finding 2)', async () => {
    const server = fakeServer([])
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const coverageSection = await screen.findByRole('region', { name: 'Dekning' })
    const focusSection = await screen.findByRole('region', { name: 'Fokus' })

    await user.type(within(focusSection).getByLabelText('Legg til bransje'), '47.911')
    await user.click(
      within(focusSection).getByRole('button', { name: 'Legg til bransje i listen' })
    )
    expect(within(focusSection).getByText('47.911')).toBeInTheDocument()

    await user.click(within(coverageSection).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(within(coverageSection).getByRole('button', { name: 'Lagre dekning' }))
    await screen.findByText('Lagret — synkroniserer …')

    // A coverage save must not have called Fokus's own PUT — the draft is still just local
    // state, unsaved, and it is still there.
    expect(within(focusSection).getByText('47.911')).toBeInTheDocument()
    const focusPuts = server.fetchMock.mock.calls.filter(
      ([u, i]) => u === '/api/config/focus' && (i?.method ?? 'GET') === 'PUT'
    )
    expect(focusPuts).toHaveLength(0)
  })

  it('switching language does not discard an unsaved coverage edit', async () => {
    const server = fakeServer([])
    const user = userEvent.setup()
    renderView(server.fetchMock, { withLangSwitch: true })
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(screen.getByRole('button', { name: 'Switch to English' }))

    expect(within(section).getByRole('checkbox', { name: 'Lillehammer' })).toBeChecked()
    const discoveryGets = server.fetchMock.mock.calls.filter(
      ([u, i]) => u === '/api/config/discovery' && (i?.method ?? 'GET') === 'GET'
    )
    expect(discoveryGets).toHaveLength(1)
  })
})
