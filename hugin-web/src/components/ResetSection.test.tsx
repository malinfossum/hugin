import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FocusProvider, saveFocus } from '../focus'
import { ReadOnlyProvider } from '../readOnly'
import type { StatusDto } from '../types'
import { LiveRegionProvider } from './LiveRegion'
import { ResetSection } from './ResetSection'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

const STATUS: StatusDto = {
  brreg: null,
  nav: null,
  reviewMark: null,
  activeAds: 283,
  companies: 1037,
  pipelineEntries: 13,
  readOnly: false,
  scopeConfigured: true,
}

/** `resetStatus` makes POST /api/reset answer with that status (409 = a sync is running)
 * instead of the success body; `resetBody` overrides the success body (defaults to echoing the
 * request's own mode with no snapshot path). `pending: true` never resolves the reset POST, so
 * a test can assert the in-flight disabled state before resolving it manually via the returned
 * `resolveReset`. `posts` records every POST /api/reset body. */
function fakeServer(
  options: {
    resetStatus?: number
    resetBody?: unknown
    statusBody?: StatusDto
    pending?: boolean
  } = {}
) {
  const posts: unknown[] = []
  let resolveReset: (() => void) | undefined
  const pendingPromise = options.pending
    ? new Promise<void>((resolve) => {
        resolveReset = resolve
      })
    : undefined

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/status' && method === 'GET') {
      return Promise.resolve(jsonResponse(options.statusBody ?? STATUS))
    }
    if (url === '/api/reset' && method === 'POST') {
      const body = JSON.parse(init?.body as string)
      posts.push(body)
      const respond = () => {
        if (options.resetStatus) {
          return jsonResponse(
            { title: 'En synk kjører — vent til den er ferdig.' },
            { status: options.resetStatus }
          )
        }
        return jsonResponse(options.resetBody ?? { mode: body.mode, snapshotPath: null })
      }
      return pendingPromise ? pendingPromise.then(respond) : Promise.resolve(respond())
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  return { fetchMock, posts, resolveReset }
}

function renderSection(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <ReadOnlyProvider>
      <FocusProvider>
        <LiveRegionProvider>
          <ResetSection />
        </LiveRegionProvider>
      </FocusProvider>
    </ReadOnlyProvider>
  )
}

/** jsdom's own Location.reload throws "Not implemented", and `location.reload` itself is a
 * non-configurable own property jsdom refuses to redefine — so replace the whole `location`
 * global instead, the way `vi.stubGlobal` is meant to be used. `vi.unstubAllGlobals()` in
 * afterEach restores the real one. */
function stubReload() {
  const reload = vi.fn()
  vi.stubGlobal('location', { ...window.location, reload })
  return reload
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-focus')
})

describe('ResetSection', () => {
  it('the hard reset stays disabled until the phrase is typed', async () => {
    const user = userEvent.setup()
    renderSection(fakeServer().fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))

    const confirm = screen.getByRole('button', { name: 'Slett alt' })
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Skriv NULLSTILL for å bekrefte'), 'NULLSTILL')
    expect(confirm).toBeEnabled()
  })

  it('rejects anything short of the exact word', async () => {
    const user = userEvent.setup()
    renderSection(fakeServer().fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))
    const confirm = screen.getByRole('button', { name: 'Slett alt' })
    const field = screen.getByLabelText('Skriv NULLSTILL for å bekrefte')

    await user.type(field, 'nullstill')
    expect(confirm).toBeDisabled()

    await user.clear(field)
    await user.type(field, 'NULLSTILLE')
    expect(confirm).toBeDisabled()
  })

  it('is hidden entirely in read-only mode', async () => {
    renderSection(fakeServer({ statusBody: { ...STATUS, readOnly: true } }).fetchMock)

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Nullstill dekning' })).not.toBeInTheDocument()
    )
    expect(screen.queryByRole('button', { name: 'Start på nytt' })).not.toBeInTheDocument()
  })

  it('Nullstill dekning posts { mode: "scope" } and resets the stored focus', async () => {
    const user = userEvent.setup()
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    const { fetchMock, posts } = fakeServer()
    renderSection(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Nullstill dekning' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Nullstill dekning' }))

    await waitFor(() => expect(posts).toEqual([{ mode: 'scope' }]))
    await waitFor(() => expect(window.localStorage.getItem('hugin-focus')).toBeNull())
  })

  it('disables both trigger buttons while a reset request is in flight, re-enabling once it settles', async () => {
    const user = userEvent.setup()
    const { fetchMock, resolveReset } = fakeServer({ pending: true })
    renderSection(fetchMock)

    const scopeButton = screen.getByRole('button', { name: 'Nullstill dekning' })
    const hardButton = screen.getByRole('button', { name: 'Start på nytt' })
    await user.click(scopeButton)
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Nullstill dekning' }))

    expect(scopeButton).toBeDisabled()
    expect(hardButton).toBeDisabled()

    resolveReset?.()
    await waitFor(() => expect(scopeButton).toBeEnabled())
    expect(hardButton).toBeEnabled()
  })

  it('Start på nytt posts { mode: "all" }, shows the returned snapshot path, resets focus and reloads', async () => {
    const user = userEvent.setup()
    const reload = stubReload()
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    const { fetchMock, posts } = fakeServer({
      resetBody: { mode: 'all', snapshotPath: 'hugin.db.reset-20260909-120000.bak' },
    })
    renderSection(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))
    await user.type(screen.getByLabelText('Skriv NULLSTILL for å bekrefte'), 'NULLSTILL')
    await user.click(screen.getByRole('button', { name: 'Slett alt' }))

    await waitFor(() => expect(posts).toEqual([{ mode: 'all' }]))
    expect(
      await screen.findByText(
        'Nullstilt. Sikkerhetskopi lagret: hugin.db.reset-20260909-120000.bak'
      )
    ).toBeInTheDocument()
    expect(window.localStorage.getItem('hugin-focus')).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('surfaces a 409 (a sync is running) on the scope reset as a failure, not a success', async () => {
    const user = userEvent.setup()
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    const { fetchMock } = fakeServer({ resetStatus: 409 })
    renderSection(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Nullstill dekning' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Nullstill dekning' }))

    expect(
      await screen.findByText(
        'Kunne ikke nullstille dekningen: En synk kjører — vent til den er ferdig.'
      )
    ).toBeInTheDocument()
    // Not treated as success: the stored focus survives the failed request.
    expect(window.localStorage.getItem('hugin-focus')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Nullstill dekning' })).toBeEnabled()
  })

  it('surfaces a 409 on the hard reset the same way, without wiping the stored focus or reloading', async () => {
    const user = userEvent.setup()
    const reload = stubReload()
    saveFocus({ fylke: '34', kommune: null, categories: [] })
    const { fetchMock } = fakeServer({ resetStatus: 409 })
    renderSection(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))
    await user.type(screen.getByLabelText('Skriv NULLSTILL for å bekrefte'), 'NULLSTILL')
    await user.click(screen.getByRole('button', { name: 'Slett alt' }))

    expect(
      await screen.findByText('Kunne ikke nullstille: En synk kjører — vent til den er ferdig.')
    ).toBeInTheDocument()
    expect(window.localStorage.getItem('hugin-focus')).not.toBeNull()
    expect(reload).not.toHaveBeenCalled()
  })

  it('clears the typed confirmation after a failed hard reset, so reopening the dialog starts disabled again (Task 11 finding 3)', async () => {
    const user = userEvent.setup()
    const { fetchMock } = fakeServer({ resetStatus: 409 })
    renderSection(fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))
    await user.type(screen.getByLabelText('Skriv NULLSTILL for å bekrefte'), 'NULLSTILL')
    await user.click(screen.getByRole('button', { name: 'Slett alt' }))

    await screen.findByText('Kunne ikke nullstille: En synk kjører — vent til den er ferdig.')

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))
    expect(screen.getByLabelText('Skriv NULLSTILL for å bekrefte')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Slett alt' })).toBeDisabled()
  })

  it('focuses the dialog heading on open, not the Eksport link, and describes the disabled confirm button (Task 11 finding 4)', async () => {
    const user = userEvent.setup()
    renderSection(fakeServer().fetchMock)

    await user.click(screen.getByRole('button', { name: 'Start på nytt' }))

    const dialog = screen.getByRole('dialog', { name: 'Slette alt og starte på nytt?' })
    expect(
      within(dialog).getByRole('heading', { name: 'Slette alt og starte på nytt?' })
    ).toHaveFocus()

    const confirm = screen.getByRole('button', { name: 'Slett alt' })
    const describedBy = confirm.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Skriv NULLSTILL for å bekrefte'
    )
  })
})
