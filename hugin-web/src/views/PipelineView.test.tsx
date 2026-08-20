import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import type { PipelineDto, TrackResponse } from '../types'
import { PipelineView } from './PipelineView'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

function entry(overrides: Partial<PipelineDto> = {}): PipelineDto {
  return {
    orgnr: '915787630',
    companyName: 'Acme AS',
    status: 'funnet',
    route: 'ingen',
    why: '',
    note: null,
    svar: null,
    updated: '2026-08-15T00:00:00Z',
    ...overrides,
  }
}

/** Fake server: GET /api/pipeline; PUT /api/pipeline/{orgnr} updates fields in place. */
function fakeServer(seed: PipelineDto[], warning: string | null = null) {
  const entries = seed.map((e) => ({ ...e }))
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/pipeline' && method === 'GET') {
      return Promise.resolve(jsonResponse(entries))
    }
    const putMatch = url.match(/^\/api\/pipeline\/(.+)$/)
    if (putMatch && method === 'PUT') {
      const target = entries.find((e) => e.orgnr === putMatch[1])
      if (!target) return Promise.resolve(jsonResponse({ title: 'Fant ikke' }, { status: 404 }))
      const body = JSON.parse(init?.body as string)
      target.status = body.status
      target.why = body.why
      target.note = body.note
      target.svar = body.svar
      target.updated = new Date().toISOString()
      const response: TrackResponse = { entry: { ...target }, warning }
      return Promise.resolve(jsonResponse(response))
    }
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
  return fetchMock
}

function renderView(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LiveRegionProvider>
      <PipelineView />
    </LiveRegionProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PipelineView', () => {
  it('groups entries into the four sections with correct membership', async () => {
    const entries = [
      entry({ orgnr: '1', companyName: 'Funnet-firma', status: 'funnet' }),
      entry({ orgnr: '2', companyName: 'Søkt-firma', status: 'soekt-selv', why: 'begrunnelse' }),
      entry({ orgnr: '3', companyName: 'Bedt-firma', status: 'bedt-get', why: 'begrunnelse' }),
      entry({ orgnr: '4', companyName: 'Svar-firma', status: 'svar', why: 'begrunnelse' }),
    ]
    renderView(fakeServer(entries))

    await screen.findByText('Funnet-firma')

    const funnetSection = screen.getByRole('heading', { name: 'Funnet' }).closest('section')
    const soektSection = screen.getByRole('heading', { name: 'Søkt selv' }).closest('section')
    const bedtSection = screen.getByRole('heading', { name: 'Bedt GET sjekke' }).closest('section')
    const svarSection = screen.getByRole('heading', { name: 'Svar' }).closest('section')
    if (!funnetSection || !soektSection || !bedtSection || !svarSection) {
      throw new Error('section not found')
    }

    expect(within(funnetSection).getByText('Funnet-firma')).toBeInTheDocument()
    expect(within(soektSection).getByText('Søkt-firma')).toBeInTheDocument()
    expect(within(bedtSection).getByText('Bedt-firma')).toBeInTheDocument()
    expect(within(svarSection).getByText('Svar-firma')).toBeInTheDocument()

    expect(within(funnetSection).queryByText('Søkt-firma')).not.toBeInTheDocument()
    expect(within(soektSection).queryByText('Funnet-firma')).not.toBeInTheDocument()
  })

  it('shows the funnet-hint text under the Funnet heading', async () => {
    renderView(fakeServer([entry({ orgnr: '1', companyName: 'Funnet-firma', status: 'funnet' })]))

    await screen.findByText('Funnet-firma')

    expect(screen.getByText('Funnet-oppføringer tas aldri med i eksporten.')).toBeInTheDocument()
  })

  it('shows "⚠ mangler begrunnelse" for a beyond-funnet entry with empty why', async () => {
    renderView(
      fakeServer([entry({ orgnr: '2', companyName: 'Søkt-firma', status: 'soekt-selv', why: '' })])
    )

    await screen.findByText('Søkt-firma')

    expect(screen.getByText('⚠ mangler begrunnelse')).toBeInTheDocument()
  })

  it('does not show the missing-why marker for a funnet entry with empty why', async () => {
    renderView(
      fakeServer([entry({ orgnr: '1', companyName: 'Funnet-firma', status: 'funnet', why: '' })])
    )

    await screen.findByText('Funnet-firma')

    expect(screen.queryByText('⚠ mangler begrunnelse')).not.toBeInTheDocument()
  })

  it('edit-submit PUTs the right body and announces "Lagret."', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer([
      entry({ orgnr: '1', companyName: 'Acme AS', status: 'funnet', why: '' }),
    ])
    renderView(fetchMock)

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))

    const form = screen.getByLabelText('Status').closest('form')
    if (!form) throw new Error('form not found')

    await user.selectOptions(within(form).getByLabelText('Status'), 'soekt-selv')
    await user.type(within(form).getByLabelText('Begrunnelse'), 'Søkte via nettside')
    await user.type(within(form).getByLabelText('Notat'), 'Fulgt opp')
    await user.type(within(form).getByLabelText('Svar'), 'Venter')

    await user.click(within(form).getByRole('button', { name: 'Lagre' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pipeline/1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            status: 'soekt-selv',
            why: 'Søkte via nettside',
            note: 'Fulgt opp',
            svar: 'Venter',
          }),
        })
      )
    })

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await waitFor(() => {
      expect(liveRegion).toHaveTextContent('Lagret.')
    })

    // form closes after a successful save
    await waitFor(() => {
      expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    })
  })

  it('renders a response warning inline with the ⚠ prefix', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer(
      [entry({ orgnr: '1', companyName: 'Acme AS', status: 'funnet', why: '' })],
      'Ingen NAV-annonse funnet for denne bedriften.'
    )
    renderView(fetchMock)

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))
    await user.type(screen.getByLabelText('Begrunnelse'), 'Begrunnelse her')
    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    const warning = await screen.findByText(/⚠\s*Ingen NAV-annonse funnet for denne bedriften\./)
    expect(warning).toHaveAttribute('role', 'status')
  })

  it('renders a retry button on fetch failure', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('network down')))
    renderView(fetchMock)

    const retry = await screen.findByRole('button', { name: 'Prøv igjen' })
    expect(retry).toBeInTheDocument()
  })

  it('shows a PUT error inline in the form and keeps it open', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      if (url === '/api/pipeline' && method === 'GET') {
        return Promise.resolve(
          jsonResponse([entry({ orgnr: '1', companyName: 'Acme AS', status: 'funnet', why: '' })])
        )
      }
      if (method === 'PUT') {
        return Promise.resolve(jsonResponse({ title: 'Ugyldig status' }, { status: 400 }))
      }
      return Promise.reject(new Error(`unhandled request ${method} ${url}`))
    })
    renderView(fetchMock)

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))
    await user.click(screen.getByRole('button', { name: 'Lagre' }))

    expect(await screen.findByText('Ugyldig status')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
  })
})
