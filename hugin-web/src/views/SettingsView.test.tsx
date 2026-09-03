import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { FocusProvider, loadFocus, saveFocus } from '../focus'
import { LanguageProvider } from '../i18n'
import type { CompanyDto, DiscoveryConfigDto, KommuneDto, SourceDto } from '../types'
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

function company(overrides: Partial<CompanyDto> = {}): CompanyDto {
  return {
    orgnr: '915787630',
    name: 'Acme AS',
    kommune: '0301',
    kommuneNavn: null,
    naceCode: '62.010',
    isBranch: false,
    website: null,
    parentOrgnr: null,
    ...overrides,
  }
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
 * plus a GET /api/companies stub the Fokus section's kommune select lazily fetches, and the
 * discovery-config trio (GET/PUT /api/config/discovery, GET /api/kommuner, POST /api/sync) the
 * Dekning section always fetches on mount, in every scenario. Pass `null` as seed to make GET
 * /api/sources reject (load-failure scenarios); `companies` defaults to empty, which is fine
 * wherever a test doesn't care about kommune options. `discovery`/`kommuner` seed the Dekning
 * section, `kommunerDown` makes GET /api/kommuner fail (the fylke-only degraded mode), and
 * `putStatus` makes the PUT fail with that status instead of echoing `discovery` back;
 * `syncStatus` makes POST /api/sync answer with that status (409 = one already runs).
 * Returns `{ fetchMock, puts }` — `puts` records every PUT /api/config/discovery body. */
function fakeServer(
  seed: SourceDto[] | null,
  companies: CompanyDto[] = [],
  options: {
    discovery?: DiscoveryConfigDto
    kommuner?: KommuneDto[]
    kommunerDown?: boolean
    putStatus?: number
    syncStatus?: number
  } = {}
) {
  let entries = (seed ?? []).map((s) => ({ ...s }))
  let nextId = Math.max(0, ...entries.map((s) => s.id)) + 1
  const discovery = options.discovery ?? DEFAULT_DISCOVERY
  const kommuner = options.kommuner ?? DEFAULT_KOMMUNER
  const puts: unknown[] = []

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'

    if (url === '/api/companies' && method === 'GET') {
      return Promise.resolve(jsonResponse(companies))
    }
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
      if (options.kommunerDown) {
        return Promise.resolve(jsonResponse({ title: 'Registeret er nede' }, { status: 503 }))
      }
      return Promise.resolve(jsonResponse(kommuner))
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

function renderView(
  fetchMock: ReturnType<typeof vi.fn>,
  props: Partial<{
    theme: 'dark' | 'light'
    onToggleTheme: () => void
    onSourcesChanged: () => void
  }> = {}
) {
  vi.stubGlobal('fetch', fetchMock)
  const onToggleTheme = props.onToggleTheme ?? vi.fn()
  const onSourcesChanged = props.onSourcesChanged ?? vi.fn()
  const theme = props.theme ?? 'dark'
  const utils = render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FocusProvider>
          <SettingsView
            theme={theme}
            onToggleTheme={onToggleTheme}
            onSourcesChanged={onSourcesChanged}
          />
        </FocusProvider>
      </LiveRegionProvider>
    </LanguageProvider>
  )
  return { ...utils, onToggleTheme, onSourcesChanged }
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

  it('language section renders the NO/EN pressed-state buttons', async () => {
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('button', { name: 'Legg til lenke' })
    const noButton = screen.getByRole('button', { name: 'NO' })
    const enButton = screen.getByRole('button', { name: 'EN' })
    expect(noButton).toHaveAttribute('aria-pressed', 'true')
    expect(enButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('theme section calls onToggleTheme', async () => {
    const user = userEvent.setup()
    const { onToggleTheme } = renderView(fakeServer([]).fetchMock, { theme: 'dark' })

    await screen.findByRole('button', { name: 'Legg til lenke' })
    await user.click(screen.getByRole('button', { name: 'Bytt til lyst tema' }))

    expect(onToggleTheme).toHaveBeenCalled()
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

  it('renders a Fokus heading with fylke/kommune selects and a category fieldset', async () => {
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Fokus' })
    expect(within(section).getByLabelText('Fylke')).toBeInTheDocument()
    expect(within(section).getByLabelText('Kommune')).toBeInTheDocument()
    const fieldset = within(section).getByRole('group', { name: 'Kategorier' })
    expect(within(fieldset).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('changing the Fokus fylke select announces and persists the choice', async () => {
    const user = userEvent.setup()
    renderView(fakeServer([]).fetchMock)

    const section = await screen.findByRole('region', { name: 'Fokus' })
    await user.selectOptions(within(section).getByLabelText('Fylke'), 'Innlandet')

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Fokus oppdatert.')
    })
    expect(loadFocus()).toEqual({ fylke: '34', kommune: null, categories: [] })
  })

  it('narrows the Fokus kommune select by the chosen fylke, from lazily-fetched companies', async () => {
    const user = userEvent.setup()
    const companies = [
      company({ orgnr: '1', kommune: '3403', kommuneNavn: 'Hamar' }),
      company({ orgnr: '2', kommune: '0301', kommuneNavn: 'Oslo' }),
    ]
    renderView(fakeServer([], companies).fetchMock)

    const section = await screen.findByRole('region', { name: 'Fokus' })
    await user.selectOptions(within(section).getByLabelText('Fylke'), 'Innlandet')

    await waitFor(() => {
      const kommuneOptions = within(within(section).getByLabelText('Kommune'))
        .getAllByRole('option')
        .map((o) => o.textContent)
      expect(kommuneOptions).toEqual(['Alle', 'Hamar'])
    })
  })

  it('choosing a Fokus kommune with fylke still on Alle derives and stores the fylke (loadFocus round-trips it)', async () => {
    const user = userEvent.setup()
    const companies = [
      company({ orgnr: '1', kommune: '0301', kommuneNavn: 'Oslo' }),
      company({ orgnr: '2', kommune: '3403', kommuneNavn: 'Hamar' }),
    ]
    renderView(fakeServer([], companies).fetchMock)

    const section = await screen.findByRole('region', { name: 'Fokus' })
    expect((within(section).getByLabelText('Fylke') as HTMLSelectElement).value).toBe('')
    await waitFor(() => {
      expect(within(within(section).getByLabelText('Kommune')).getAllByRole('option')).toHaveLength(
        3
      )
    })
    await user.selectOptions(within(section).getByLabelText('Kommune'), '0301')

    expect(loadFocus()).toEqual({ fylke: '03', kommune: '0301', categories: [] })
  })

  it('toggling a Fokus category checkbox persists it and preserves the stored region', async () => {
    const user = userEvent.setup()
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('heading', { name: 'Fokus' })
    await user.click(screen.getByRole('checkbox', { name: 'Utvikling' }))

    expect(loadFocus()).toEqual({ fylke: '34', kommune: null, categories: ['Utvikling'] })
  })

  it('reset button announces and clears the stored focus', async () => {
    const user = userEvent.setup()
    saveFocus({ fylke: '34', kommune: null, categories: ['Utvikling'] })
    renderView(fakeServer([]).fetchMock)

    await screen.findByRole('heading', { name: 'Fokus' })
    await user.click(screen.getByRole('button', { name: 'Vis oppstartsvalget igjen' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Oppstartsvalget vises ved neste start.')
    })
    expect(loadFocus()).toBeNull()
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
    const server = fakeServer([], [], { putStatus: 500 })
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
    const server = fakeServer([], [], { syncStatus: 409 })
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
    const server = fakeServer([], [], { kommunerDown: true })
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
    const server = fakeServer([], [], {
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

  it('switching language does not discard an unsaved coverage edit', async () => {
    const server = fakeServer([])
    const user = userEvent.setup()
    renderView(server.fetchMock)
    const section = await screen.findByRole('region', { name: 'Dekning' })

    await user.click(within(section).getByRole('checkbox', { name: 'Lillehammer' }))
    await user.click(screen.getByRole('button', { name: 'EN' }))

    expect(within(section).getByRole('checkbox', { name: 'Lillehammer' })).toBeChecked()
    const discoveryGets = server.fetchMock.mock.calls.filter(
      ([u, i]) => u === '/api/config/discovery' && (i?.method ?? 'GET') === 'GET'
    )
    expect(discoveryGets).toHaveLength(1)
  })
})
