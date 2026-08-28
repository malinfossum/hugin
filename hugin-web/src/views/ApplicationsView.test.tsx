import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { LanguageProvider } from '../i18n'
import type { PipelineDto, TrackResponse } from '../types'
import { ApplicationsView } from './ApplicationsView'

const SORT_STORAGE_KEY = 'hugin-soknader-sortering'

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
    status: 'active',
    starred: false,
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
      if (body.starred !== undefined) target.starred = body.starred
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
    <LanguageProvider>
      <LiveRegionProvider>
        <ApplicationsView />
      </LiveRegionProvider>
    </LanguageProvider>
  )
}

function namesInSection(section: HTMLElement): (string | null)[] {
  return Array.from(section.querySelectorAll('.text-strong')).map((el) => el.textContent)
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem(SORT_STORAGE_KEY)
})

describe('ApplicationsView', () => {
  it('groups entries into the three sections with correct membership', async () => {
    const entries = [
      entry({ orgnr: '1', companyName: 'Aktiv-firma', status: 'active' }),
      entry({ orgnr: '2', companyName: 'Søkt-firma', status: 'applied', why: 'begrunnelse' }),
      entry({ orgnr: '3', companyName: 'Svar-firma', status: 'answered', why: 'begrunnelse' }),
    ]
    renderView(fakeServer(entries))

    await screen.findByText('Aktiv-firma')

    const activeSection = screen.getByRole('heading', { name: 'Aktiv' }).closest('section')
    const appliedSection = screen.getByRole('heading', { name: 'Søkt' }).closest('section')
    const answeredSection = screen.getByRole('heading', { name: 'Svar' }).closest('section')
    if (!activeSection || !appliedSection || !answeredSection) {
      throw new Error('section not found')
    }

    expect(within(activeSection).getByText('Aktiv-firma')).toBeInTheDocument()
    expect(within(appliedSection).getByText('Søkt-firma')).toBeInTheDocument()
    expect(within(answeredSection).getByText('Svar-firma')).toBeInTheDocument()

    expect(within(activeSection).queryByText('Søkt-firma')).not.toBeInTheDocument()
    expect(within(appliedSection).queryByText('Aktiv-firma')).not.toBeInTheDocument()
  })

  it('shows the active-hint text under the Aktiv heading', async () => {
    renderView(fakeServer([entry({ orgnr: '1', companyName: 'Aktiv-firma', status: 'active' })]))

    await screen.findByText('Aktiv-firma')

    expect(
      screen.getByText('Aktiv-oppføringer tas bare med i eksporten når du velger det.')
    ).toBeInTheDocument()
  })

  it('shows "⚠ mangler begrunnelse" for a beyond-active entry with empty why', async () => {
    renderView(
      fakeServer([entry({ orgnr: '2', companyName: 'Søkt-firma', status: 'applied', why: '' })])
    )

    await screen.findByText('Søkt-firma')

    expect(screen.getByText('⚠ mangler begrunnelse')).toBeInTheDocument()
  })

  it('does not show the missing-why marker for an active entry with empty why', async () => {
    renderView(
      fakeServer([entry({ orgnr: '1', companyName: 'Aktiv-firma', status: 'active', why: '' })])
    )

    await screen.findByText('Aktiv-firma')

    expect(screen.queryByText('⚠ mangler begrunnelse')).not.toBeInTheDocument()
  })

  it('displays an all-caps Brreg company name in title case', async () => {
    renderView(
      fakeServer([entry({ orgnr: '1', companyName: 'NORSK TIPPING AS', status: 'active' })])
    )

    expect(await screen.findByText('Norsk Tipping AS')).toBeInTheDocument()
    expect(screen.queryByText('NORSK TIPPING AS')).not.toBeInTheDocument()
  })

  it('edit-submit PUTs the right body and announces "Lagret."', async () => {
    const user = userEvent.setup()
    const fetchMock = fakeServer([
      entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', why: '' }),
    ])
    renderView(fetchMock)

    await screen.findByText('Acme AS')
    await user.click(screen.getByRole('button', { name: 'Rediger' }))

    const form = screen.getByLabelText('Status').closest('form')
    if (!form) throw new Error('form not found')

    await user.selectOptions(within(form).getByLabelText('Status'), 'applied')
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
            status: 'applied',
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
      [entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', why: '' })],
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
          jsonResponse([entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', why: '' })])
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

  describe('starring', () => {
    it('toggle PUTs starred flipped with the other fields preserved, and aria-pressed updates after refetch', async () => {
      const user = userEvent.setup()
      const fetchMock = fakeServer([
        entry({
          orgnr: '1',
          companyName: 'Acme AS',
          status: 'active',
          why: 'grunn',
          note: 'notat',
          svar: 'svar',
          starred: false,
        }),
      ])
      renderView(fetchMock)

      await screen.findByText('Acme AS')
      const starButton = screen.getByRole('button', { name: 'Gi stjerne' })
      expect(starButton).toHaveAttribute('aria-pressed', 'false')

      await user.click(starButton)

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/pipeline/1',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({
              status: 'active',
              why: 'grunn',
              note: 'notat',
              svar: 'svar',
              starred: true,
            }),
          })
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Fjern stjerne' })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
      })
    })

    it('un-toggling a starred entry sends starred: false', async () => {
      const user = userEvent.setup()
      const fetchMock = fakeServer([
        entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', starred: true }),
      ])
      renderView(fetchMock)

      await screen.findByText('Acme AS')
      await user.click(screen.getByRole('button', { name: 'Fjern stjerne' }))

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/pipeline/1',
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"starred":false'),
          })
        )
      })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Gi stjerne' })).toHaveAttribute(
          'aria-pressed',
          'false'
        )
      })
    })

    it('disables the star button while its PUT is in flight, then re-enables it', async () => {
      const user = userEvent.setup()
      let resolvePut: (response: Response) => void = () => {}
      const putPromise = new Promise<Response>((resolve) => {
        resolvePut = resolve
      })
      const server = fakeServer([
        entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', starred: false }),
      ])
      let putCalls = 0
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const method = init?.method ?? 'GET'
        if (url === '/api/pipeline/1' && method === 'PUT') {
          putCalls += 1
          return putPromise
        }
        return server(input, init)
      })
      renderView(fetchMock)

      await screen.findByText('Acme AS')
      const starButton = screen.getByRole('button', { name: 'Gi stjerne' })
      expect(starButton).not.toBeDisabled()

      await user.click(starButton)
      expect(starButton).toBeDisabled()

      // A second click while the first PUT is still pending must not fire another request.
      await user.click(starButton)
      expect(putCalls).toBe(1)

      resolvePut(
        jsonResponse({
          entry: entry({ orgnr: '1', companyName: 'Acme AS', status: 'active', starred: true }),
          warning: null,
        })
      )

      await waitFor(() => {
        expect(starButton).not.toBeDisabled()
      })
    })
  })

  describe('sorting', () => {
    it('select is labeled "Sorter etter" and defaults to "Stjerne først"', async () => {
      renderView(fakeServer([entry({ orgnr: '1', companyName: 'Acme AS' })]))
      await screen.findByText('Acme AS')

      const select = screen.getByLabelText('Sorter etter') as HTMLSelectElement
      expect(select.value).toBe('starred')
    })

    it('"Stjerne først" orders starred entries before unstarred ones within a section', async () => {
      const entries = [
        entry({ orgnr: '1', companyName: 'Bertha', status: 'applied', why: 'x', starred: false }),
        entry({ orgnr: '2', companyName: 'Anna', status: 'applied', why: 'x', starred: true }),
      ]
      renderView(fakeServer(entries))
      await screen.findByText('Anna')

      const section = screen.getByRole('heading', { name: 'Søkt' }).closest('section')
      if (!section) throw new Error('section not found')
      expect(namesInSection(section)).toEqual(['Anna', 'Bertha'])
    })

    it('"Navn" sorts alphabetically within a section', async () => {
      const user = userEvent.setup()
      const entries = [
        entry({ orgnr: '1', companyName: 'Bertha', status: 'applied', why: 'x' }),
        entry({ orgnr: '2', companyName: 'Anna', status: 'applied', why: 'x' }),
      ]
      renderView(fakeServer(entries))
      await screen.findByText('Bertha')

      await user.selectOptions(screen.getByLabelText('Sorter etter'), 'name')

      const section = screen.getByRole('heading', { name: 'Søkt' }).closest('section')
      if (!section) throw new Error('section not found')
      expect(namesInSection(section)).toEqual(['Anna', 'Bertha'])
    })

    it('"Sist oppdatert" orders the most recently updated entry first within a section', async () => {
      const user = userEvent.setup()
      const entries = [
        entry({
          orgnr: '1',
          companyName: 'Eldre',
          status: 'applied',
          why: 'x',
          updated: '2026-08-10T00:00:00Z',
        }),
        entry({
          orgnr: '2',
          companyName: 'Nyere',
          status: 'applied',
          why: 'x',
          updated: '2026-08-18T00:00:00Z',
        }),
      ]
      renderView(fakeServer(entries))
      await screen.findByText('Eldre')

      await user.selectOptions(screen.getByLabelText('Sorter etter'), 'updated')

      const section = screen.getByRole('heading', { name: 'Søkt' }).closest('section')
      if (!section) throw new Error('section not found')
      expect(namesInSection(section)).toEqual(['Nyere', 'Eldre'])
    })

    it('persists the chosen sort mode to localStorage and restores it on the next mount', async () => {
      const user = userEvent.setup()
      const entries = [entry({ orgnr: '1', companyName: 'Acme AS' })]
      const { unmount } = renderView(fakeServer(entries))
      await screen.findByText('Acme AS')

      await user.selectOptions(screen.getByLabelText('Sorter etter'), 'name')
      expect(window.localStorage.getItem(SORT_STORAGE_KEY)).toBe('name')

      unmount()

      renderView(fakeServer(entries))
      await screen.findByText('Acme AS')
      expect((screen.getByLabelText('Sorter etter') as HTMLSelectElement).value).toBe('name')
    })
  })
})
