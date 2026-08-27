import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { LanguageProvider } from '../i18n'
import type { SourceDto } from '../types'
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

/** Fake server backing full Sources CRUD: GET list, POST add, PUT edit, POST reorder, DELETE. */
function fakeServer(seed: SourceDto[]) {
  let entries = seed.map((s) => ({ ...s }))
  let nextId = Math.max(0, ...entries.map((s) => s.id)) + 1

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'

    if (url === '/api/sources' && method === 'GET') {
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
  return fetchMock
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
        <SettingsView
          theme={theme}
          onToggleTheme={onToggleTheme}
          onSourcesChanged={onSourcesChanged}
        />
      </LiveRegionProvider>
    </LanguageProvider>
  )
  return { ...utils, onToggleTheme, onSourcesChanged }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsView', () => {
  it('lists fetched sources in order', async () => {
    const entries = [
      source({ id: 1, label: 'FINN', url: 'https://finn.no', position: 0 }),
      source({ id: 2, label: 'LinkedIn', url: 'https://linkedin.com', position: 1 }),
    ]
    renderView(fakeServer(entries))

    await screen.findByText('FINN')
    const links = screen.getAllByRole('link', { name: /FINN|LinkedIn/ })
    expect(links.map((l) => l.textContent)).toEqual(['FINN', 'LinkedIn'])
  })

  it('add form POSTs {label, url} and calls onSourcesChanged', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer([])
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
    const fetchMock = fakeServer(entries)
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
    const fetchMock = fakeServer(entries)
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
    const fetchMock = fakeServer(entries)
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
    renderView(fakeServer(entries))

    await screen.findByText('FINN')
    const moveUpButtons = screen.getAllByRole('button', { name: 'Flytt opp' })
    const moveDownButtons = screen.getAllByRole('button', { name: 'Flytt ned' })

    expect(moveUpButtons[0]).toBeDisabled()
    expect(moveDownButtons[0]).not.toBeDisabled()
    expect(moveUpButtons[1]).not.toBeDisabled()
    expect(moveDownButtons[1]).toBeDisabled()
  })

  it('language section renders the NO/EN pressed-state buttons', async () => {
    renderView(fakeServer([]))

    await screen.findByRole('button', { name: 'Legg til lenke' })
    const noButton = screen.getByRole('button', { name: 'NO' })
    const enButton = screen.getByRole('button', { name: 'EN' })
    expect(noButton).toHaveAttribute('aria-pressed', 'true')
    expect(enButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('theme section calls onToggleTheme', async () => {
    const user = userEvent.setup()
    const { onToggleTheme } = renderView(fakeServer([]), { theme: 'dark' })

    await screen.findByRole('button', { name: 'Legg til lenke' })
    await user.click(screen.getByRole('button', { name: 'Bytt til lyst tema' }))

    expect(onToggleTheme).toHaveBeenCalled()
  })
})
