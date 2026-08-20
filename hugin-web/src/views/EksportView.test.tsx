import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { EksportView } from './EksportView'

const BODY_WITH_SCRIPT = '# Rapport\n\n- Acme AS: <script>alert(1)</script>\n'

function textResponse(body: string, init: { status?: number } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/markdown' },
  })
}

function fakeServer(body = BODY_WITH_SCRIPT) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/extract')) {
      return Promise.resolve(textResponse(body))
    }
    return Promise.reject(new Error(`unhandled request ${url}`))
  })
}

function renderView(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <LiveRegionProvider>
      <EksportView />
    </LiveRegionProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EksportView', () => {
  it('renders fetched content verbatim as text inside a <pre>, never as markup', async () => {
    const { container } = renderView(fakeServer())

    const pre = await screen.findByText(/Acme AS/, { selector: 'pre' })
    expect(pre).toHaveTextContent('<script>alert(1)</script>')
    expect(container.querySelector('script')).toBeNull()
  })

  it('fetches on mount with the default scope=all&format=md', async () => {
    const fetchMock = fakeServer()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })

    const initialCall = fetchMock.mock.calls[0][0] as string
    expect(initialCall).toBe('/api/extract?scope=all&format=md')
  })

  it('refetches when the scope changes', async () => {
    const fetchMock = fakeServer()
    const user = userEvent.setup()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    await user.selectOptions(screen.getByLabelText('Omfang'), 'Nytt')

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => u)
      expect(urls).toContain('/api/extract?scope=new&format=md')
    })
  })

  it('refetches when the format changes', async () => {
    const fetchMock = fakeServer()
    const user = userEvent.setup()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    await user.selectOptions(screen.getByLabelText('Format'), 'txt')

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => u)
      expect(urls).toContain('/api/extract?scope=all&format=txt')
    })
  })

  it('scope=category only fetches once a category is typed, then includes it in the URL', async () => {
    const fetchMock = fakeServer()
    const user = userEvent.setup()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    fetchMock.mockClear()

    await user.selectOptions(screen.getByLabelText('Omfang'), 'Kategori')
    expect(fetchMock).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Kategori'), 'IT')

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => u)
      expect(urls).toContain('/api/extract?scope=category&format=md&category=IT')
    })
  })

  it('the download link href matches the current scope and format', async () => {
    const fetchMock = fakeServer()
    const user = userEvent.setup()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    expect(screen.getByRole('link', { name: 'Last ned' })).toHaveAttribute(
      'href',
      '/api/extract?scope=all&format=md'
    )

    await user.selectOptions(screen.getByLabelText('Format'), 'json')
    await vi.waitFor(() => {
      expect(screen.getByRole('link', { name: 'Last ned' })).toHaveAttribute(
        'href',
        '/api/extract?scope=all&format=json'
      )
    })
  })

  it('Kopier writes the exact preview text to the clipboard and announces success', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderView(fakeServer())

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    await user.click(screen.getByRole('button', { name: 'Kopier' }))

    expect(writeText).toHaveBeenCalledWith(BODY_WITH_SCRIPT)

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await vi.waitFor(() => {
      expect(liveRegion).toHaveTextContent('Kopiert til utklippstavlen.')
    })
  })

  it('announces a manual-copy fallback when the clipboard write fails', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderView(fakeServer())

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    await user.click(screen.getByRole('button', { name: 'Kopier' }))

    const liveRegion = document.querySelector('[aria-live="polite"]')
    await vi.waitFor(() => {
      expect(liveRegion).toHaveTextContent('Kunne ikke kopiere — merk teksten manuelt.')
    })
  })
})
