import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { EksportView } from './EksportView'

const MARKDOWN_WITH_SCRIPT = '# Rapport\n\n- Acme AS: <script>alert(1)</script>\n'

function textResponse(body: string, init: { status?: number } = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/markdown' },
  })
}

function fakeServer(markdown = MARKDOWN_WITH_SCRIPT) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/export')) {
      return Promise.resolve(textResponse(markdown))
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
  it('renders fetched markdown verbatim as text inside a <pre>, never as markup', async () => {
    const { container } = renderView(fakeServer())

    const pre = await screen.findByText(/Acme AS/, { selector: 'pre' })
    expect(pre).toHaveTextContent('<script>alert(1)</script>')
    expect(container.querySelector('script')).toBeNull()
  })

  it('fetches on mount with a default since 7 days ago, and refetches on date change', async () => {
    const fetchMock = fakeServer()
    renderView(fetchMock)

    await screen.findByText(/Acme AS/, { selector: 'pre' })

    const initialCall = fetchMock.mock.calls[0][0] as string
    expect(initialCall).toMatch(/^\/api\/export\?since=\d{4}-\d{2}-\d{2}$/)

    const input = screen.getByLabelText('Siden dato')
    fireEvent.change(input, { target: { value: '2026-08-01' } })

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => u)
      expect(urls).toContain('/api/export?since=2026-08-01')
    })
  })

  it('Kopier writes the exact markdown to the clipboard and announces success', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    renderView(fakeServer())

    await screen.findByText(/Acme AS/, { selector: 'pre' })
    await user.click(screen.getByRole('button', { name: 'Kopier' }))

    expect(writeText).toHaveBeenCalledWith(MARKDOWN_WITH_SCRIPT)

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
