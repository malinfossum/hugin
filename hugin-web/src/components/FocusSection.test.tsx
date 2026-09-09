import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { LanguageProvider } from '../i18n'
import { ReadOnlyProvider } from '../readOnly'
import type { FocusConfigDto, NacePreviewDto } from '../types'
import { FocusSection } from './FocusSection'

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

const DEFAULT_FOCUS: FocusConfigDto = { naeringskoder: ['62'], keywords: ['utvikler'] }

interface ServerOptions {
  focus?: FocusConfigDto
  status?: number
  recommended?: string[]
  /** Fails GET /api/config/focus/recommended with this status instead of answering `recommended`. */
  recommendedStatus?: number
  /** code -> either the preview DTO, or a status code to fail the preview call with. */
  preview?: Record<string, NacePreviewDto | number>
  putStatus?: number
  syncStatus?: number
  full?: 'ok' | 'busy' | 'failed'
}

/** Fake server for FocusSection's five endpoints — mirrors the fetch-mocking setup used
 * elsewhere in this codebase (e.g. FirstRunDialog.test.tsx): a single vi.fn matching on
 * url+method, recording every call so a test can assert what was actually sent. */
function fakeServer(opts: ServerOptions = {}) {
  const focus = opts.focus ?? DEFAULT_FOCUS
  const calls: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] =
    []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    calls.push({
      url,
      method,
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    })

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
        })
      )
    }
    if (url === '/api/config/focus' && method === 'GET') {
      if (opts.status) return Promise.resolve(jsonResponse({ title: 'nede' }, opts.status))
      return Promise.resolve(jsonResponse(focus))
    }
    if (url === '/api/config/focus' && method === 'PUT') {
      if (opts.putStatus) {
        return Promise.resolve(
          jsonResponse({ title: 'Kunne ikke skrive hugin.json' }, opts.putStatus)
        )
      }
      const body = JSON.parse(init?.body as string)
      return Promise.resolve(jsonResponse(body))
    }
    if (url === '/api/config/focus/recommended' && method === 'GET') {
      if (opts.recommendedStatus) {
        return Promise.resolve(jsonResponse({ title: 'nede' }, opts.recommendedStatus))
      }
      return Promise.resolve(jsonResponse(opts.recommended ?? []))
    }
    if (url.startsWith('/api/config/focus/preview') && method === 'GET') {
      const code = new URL(url, 'http://localhost').searchParams.get('nace') ?? ''
      const entry = opts.preview?.[code]
      if (entry === undefined) return Promise.reject(new Error(`no preview stub for ${code}`))
      if (typeof entry === 'number')
        return Promise.resolve(jsonResponse({ title: 'Brreg nede' }, entry))
      return Promise.resolve(jsonResponse(entry))
    }
    if (url === '/api/sync' && method === 'POST') {
      if (opts.syncStatus) return Promise.resolve(jsonResponse({ title: 'busy' }, opts.syncStatus))
      return Promise.resolve(new Response(null, { status: 202 }))
    }
    if (url === '/api/sync?full=1' && method === 'POST') {
      if (opts.full === 'busy') return Promise.resolve(jsonResponse({ title: 'busy' }, 409))
      if (opts.full === 'failed') return Promise.resolve(jsonResponse({ title: 'feil' }, 500))
      return Promise.resolve(new Response(null, { status: 202 }))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function renderSection(props: { previewVersion?: number } = {}) {
  return render(
    <LanguageProvider>
      <LiveRegionProvider>
        <FocusSection {...props} />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

function renderReadOnly() {
  return render(
    <LanguageProvider>
      <ReadOnlyProvider>
        <LiveRegionProvider>
          <FocusSection />
        </LiveRegionProvider>
      </ReadOnlyProvider>
    </LanguageProvider>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('FocusSection', () => {
  it('previews a code before adding it, and announces the count', async () => {
    fakeServer({
      focus: { naeringskoder: ['62'], keywords: ['utvikler'] },
      preview: { '63': { code: '63', name: 'Databehandling', units: 45 } },
    })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '63')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))

    expect(await screen.findByText(/45 bedrifter/)).toBeInTheDocument()
    // The rendered role="status" node proves nothing about the actual announcement — assert the
    // live region useAnnounce feeds, the way every other announced state change in this suite
    // does (spec B5: "A resolved preview is announced").
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent(/45 bedrifter/))
  })

  it('shows the honest invalid-format message from the preview button, not a fabricated Brreg failure', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))

    expect(await screen.findByText(/Ugyldig bransjekode/)).toBeInTheDocument()
    expect(screen.queryByText('Kunne ikke hente antall')).not.toBeInTheDocument()
  })

  it('pressing Add on an invalid code shows the same message instead of doing nothing', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))

    expect(await screen.findByText(/Ugyldig bransjekode/)).toBeInTheDocument()
    expect(screen.queryByText('abc')).not.toBeInTheDocument()
    expect(input).toHaveValue('abc')
  })

  it('a failed recommended fetch says so instead of leaving the button looking dead', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] }, recommendedStatus: 500 })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Legg til anbefalte' }))

    expect(await screen.findByText('Kunne ikke hente anbefalte bransjer.')).toBeInTheDocument()
  })

  it('«Legg til anbefalte» previews the total the newly added codes bring in, and announces it (spec B4)', async () => {
    fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      recommended: ['62', '72', '63'],
      preview: {
        '72': { code: '72', name: 'Forskning og utviklingsarbeid', units: 87 },
        '63': { code: '63', name: 'Databehandling', units: 45 },
      },
    })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Legg til anbefalte' }))

    const expected = 'Anbefalte bransjer lagt til: 2 — 132 bedrifter totalt.'
    expect(await screen.findByText(expected)).toBeInTheDocument()
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent(expected))
  })

  it('previews a partial total honestly when Brreg cannot resolve one of the newly added codes', async () => {
    fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      recommended: ['62', '72', '63'],
      preview: {
        '72': { code: '72', name: 'Forskning og utviklingsarbeid', units: 87 },
        '63': 503,
      },
    })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Legg til anbefalte' }))

    expect(
      await screen.findByText(
        'Anbefalte bransjer lagt til: 2 — 87 bedrifter totalt for 1 av dem (resten ukjent, Brreg var utilgjengelig).'
      )
    ).toBeInTheDocument()
  })

  it('warns when a code is already covered by a broader one', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '62.010')

    expect(await screen.findByText(/62\.010 dekkes allerede av 62/)).toBeInTheDocument()
  })

  it('warns the other direction too: typing a broader code over an already-listed narrower one (ruling 2)', async () => {
    fakeServer({ focus: { naeringskoder: ['62.010'], keywords: [] } })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '62')

    expect(await screen.findByText(/62\.010 dekkes allerede av 62/)).toBeInTheDocument()
  })

  it('removing the last keyword moves focus to the add field', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: ['utvikler'] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern nøkkelord «utvikler»' }))

    expect(screen.getByLabelText('Legg til nøkkelord')).toHaveFocus()
  })

  it('does not move focus when a keyword is removed but others remain', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: ['utvikler', 'frontend'] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern nøkkelord «utvikler»' }))

    expect(screen.getByLabelText('Legg til nøkkelord')).not.toHaveFocus()
    expect(screen.queryByText('utvikler')).not.toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
  })

  it('adds a typed bransje code to the list and clears the field', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))

    expect(screen.getByText('72')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('removes a bransje code from the list', async () => {
    fakeServer({ focus: { naeringskoder: ['62', '72'], keywords: [] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern bransje 72' }))

    expect(screen.queryByText('72')).not.toBeInTheDocument()
    expect(screen.getByText('62')).toBeInTheDocument()
  })

  it('adds a typed keyword to the list', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    const input = await screen.findByLabelText('Legg til nøkkelord')
    await userEvent.type(input, 'backend')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til nøkkelord i listen' }))

    expect(screen.getByText('backend')).toBeInTheDocument()
  })

  it('«Legg til anbefalte» adds only the recommended codes not already configured', async () => {
    const calls = fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      recommended: ['62', '72', '63'],
      preview: {
        '72': { code: '72', name: 'Forskning og utviklingsarbeid', units: 87 },
        '63': { code: '63', name: 'Databehandling', units: 45 },
      },
    })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Legg til anbefalte' }))

    expect(await screen.findByText('72')).toBeInTheDocument()
    expect(screen.getByText('63')).toBeInTheDocument()
    // '62' was already there — still exactly one chip for it, not a duplicate.
    expect(screen.getAllByText('62')).toHaveLength(1)
    // The offer itself is exactly the codes not already configured (spec B4) — proven here by
    // what actually gets a preview request, not just by the resulting chip list: '62' must never
    // be re-queried since it was never "added".
    await waitFor(() => {
      expect(calls.some((c) => c.url.includes('nace=72'))).toBe(true)
    })
    expect(calls.some((c) => c.url.includes('nace=62'))).toBe(false)
  })

  it('caches a preview per code within one mount, and fetches fresh again after a remount (scope-keyed cache)', async () => {
    const calls = fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      preview: { '63': { code: '63', name: 'Databehandling', units: 45 } },
    })

    const { unmount } = renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '63')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await screen.findByText(/45 bedrifter/)
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await waitFor(() => {
      expect(calls.filter((c) => c.url.startsWith('/api/config/focus/preview'))).toHaveLength(1)
    })

    unmount()
    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '63')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await screen.findByText(/45 bedrifter/)

    expect(calls.filter((c) => c.url.startsWith('/api/config/focus/preview'))).toHaveLength(2)
  })

  it('invalidates the preview cache when previewVersion changes, without remounting (Task 11 finding 2)', async () => {
    const calls = fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      preview: { '63': { code: '63', name: 'Databehandling', units: 45 } },
    })

    const { rerender } = renderSection({ previewVersion: 0 })
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '63')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await screen.findByText(/45 bedrifter/)

    rerender(
      <LanguageProvider>
        <LiveRegionProvider>
          <FocusSection previewVersion={1} />
        </LiveRegionProvider>
      </LanguageProvider>
    )

    // Same instance, not a remount — the typed code is still sitting in the field.
    expect(screen.getByLabelText('Legg til bransje')).toHaveValue('63')

    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await waitFor(() => {
      expect(calls.filter((c) => c.url.startsWith('/api/config/focus/preview'))).toHaveLength(2)
    })
  })

  it('sends X-Hugin on the preview call (guarded GET)', async () => {
    const calls = fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      preview: { '63': { code: '63', name: 'Databehandling', units: 45 } },
    })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '63')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))
    await screen.findByText(/45 bedrifter/)

    const previewCall = calls.find((c) => c.url.startsWith('/api/config/focus/preview'))
    expect(previewCall?.headers['x-hugin']).toBe('1')
  })

  it('shows a real nonzero count without claiming zero when Brreg returns no name (ruling 3)', async () => {
    fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      preview: { '99': { code: '99', name: null, units: 7 } },
    })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '99')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))

    expect(await screen.findByText('99 — 7 bedrifter')).toBeInTheDocument()
    expect(screen.queryByText(/— 0 bedrifter/)).not.toBeInTheDocument()
  })

  it('shows the literal zero-count text only for a genuine zero (name and units both empty)', async () => {
    fakeServer({
      focus: { naeringskoder: ['62'], keywords: [] },
      preview: { '99': { code: '99', name: null, units: 0 } },
    })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '99')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))

    expect(await screen.findByText('99 — 0 bedrifter')).toBeInTheDocument()
  })

  it('shows a failure message, not a fabricated zero, when Brreg is unreachable', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] }, preview: { '99': 503 } })

    renderSection()
    await userEvent.type(await screen.findByLabelText('Legg til bransje'), '99')
    await userEvent.click(screen.getByRole('button', { name: 'Vis antall' }))

    expect(await screen.findByText('Kunne ikke hente antall')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Kunne ikke hente antall')
    expect(screen.getByRole('status')).not.toHaveTextContent(/bedrifter/)
  })

  it('a changed naeringskoder starts a sync on save', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lagre fokus' }))

    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(true)
    })
    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent('Lagret — synkroniserer …'))
  })

  it('a keywords-only change does not start a sync on save', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    const input = await screen.findByLabelText('Legg til nøkkelord')
    await userEvent.type(input, 'backend')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til nøkkelord i listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lagre fokus' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => expect(liveRegion).toHaveTextContent('Lagret — gjelder fra neste synk'))
    expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(false)
  })

  it('a failed save shows a retryable error and does not sync', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] }, putStatus: 500 })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lagre fokus' }))

    expect(await screen.findByText(/Kunne ikke lagre fokus/)).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(false)
  })

  it('says the codes apply next sync when a sync is already running (409, ruling: mirrors CoverageSection)', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] }, syncStatus: 409 })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lagre fokus' }))

    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(true)
    })
    expect(await screen.findByText('Lagret — brukes ved neste synk')).toBeInTheDocument()
    expect(screen.queryByText('Lagret — synkroniserer …')).not.toBeInTheDocument()
  })

  it('says the sync could not start when the save went through but the sync did not (finding 3)', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] }, syncStatus: 500 })

    renderSection()
    const input = await screen.findByLabelText('Legg til bransje')
    await userEvent.type(input, '72')
    await userEvent.click(screen.getByRole('button', { name: 'Legg til bransje i listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Lagre fokus' }))

    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(true)
    })
    expect(await screen.findByText('Lagret — synken kunne ikke starte')).toBeInTheDocument()
    expect(screen.queryByText('Lagret — synkroniserer …')).not.toBeInTheDocument()
  })

  it('removing the last bransje chip moves focus to the add field (finding 4)', async () => {
    fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern bransje 62' }))

    expect(screen.getByLabelText('Legg til bransje')).toHaveFocus()
  })

  it('does not move focus when a bransje code is removed but others remain', async () => {
    fakeServer({ focus: { naeringskoder: ['62', '72'], keywords: [] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern bransje 62' }))

    expect(screen.getByLabelText('Legg til bransje')).not.toHaveFocus()
    expect(screen.queryByText('62')).not.toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it('confirming the full backfill posts /api/sync?full=1 (ruling 4)', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Full NAV-gjennomgang' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/minutter/)
    expect(dialog).toHaveTextContent(/aktive annonser/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Full NAV-gjennomgang' }))

    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/sync?full=1' && c.method === 'POST')).toBe(true)
    })
  })

  it('cancelling the full-backfill dialog posts nothing', async () => {
    const calls = fakeServer({ focus: { naeringskoder: ['62'], keywords: [] } })

    renderSection()
    await userEvent.click(await screen.findByRole('button', { name: 'Full NAV-gjennomgang' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

    expect(calls.some((c) => c.url === '/api/sync?full=1')).toBe(false)
  })

  it('read-only mode disables every control and hides Save and the backfill button', async () => {
    // ReadOnlyProvider itself reads /api/status; stub it to readOnly: true for this test.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
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
              readOnly: true,
            })
          )
        }
        if (url === '/api/config/focus' && (init?.method ?? 'GET') === 'GET') {
          return Promise.resolve(jsonResponse({ naeringskoder: ['62'], keywords: ['utvikler'] }))
        }
        return Promise.reject(new Error(`unhandled ${url}`))
      })
    )

    renderReadOnly()

    await waitFor(() => expect(screen.getByRole('group', { name: 'Fokus' })).toBeDisabled())
    expect(screen.queryByRole('button', { name: 'Lagre fokus' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Full NAV-gjennomgang' })).not.toBeInTheDocument()
  })

  it('shows a retryable error when the initial load fails', async () => {
    fakeServer({ status: 500 })

    renderSection()

    expect(await screen.findByText('Kunne ikke laste fokus.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument()
  })
})
