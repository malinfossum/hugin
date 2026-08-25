import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Fake server covering only what the Companies view needs on mount — the other views mounted
 * in these tests (Dashboard, Export) either don't fetch (Export has no scope chosen yet) or
 * already tolerate a rejected fetch by design (Dashboard's own tests cover that). */
function fakeServer() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/companies') {
      return Promise.resolve(jsonResponse([]))
    }
    return Promise.reject(new Error(`unhandled request ${url}`))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders five nav buttons with Dashbord active by default', () => {
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
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Søknader' }))

    expect(screen.getByRole('button', { name: 'Søknader' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Dashbord' })).not.toHaveAttribute('aria-current')
  })

  it('switches to English on the EN toggle: labels change, <html lang> and localStorage update', async () => {
    const user = userEvent.setup()
    render(<App />)

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
})
