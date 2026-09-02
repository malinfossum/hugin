import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FYLKER } from '../fylker'
import { FirstRunDialog } from './FirstRunDialog'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const kommuner = [
  { number: '3405', name: 'Lillehammer' },
  { number: '3403', name: 'Hamar' },
  { number: '3909', name: 'Larvik' },
]

const innlandetConfig = {
  municipalities: [
    { name: 'Hamar', number: '3403' },
    { name: 'Lillehammer', number: '3405' },
  ],
  fylker: [],
  allOfNorway: false,
}

/** Fake server for the dialog's four calls. `put` decides the PUT outcome; `kommunerDown`
 * makes /api/kommuner fail so the dialog degrades to fylke-only. */
function fakeServer(opts: { put?: 'ok' | 'fail'; kommunerDown?: boolean } = {}) {
  const calls: { url: string; method: string; body?: unknown }[] = []
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url === '/api/config/discovery' && method === 'GET')
      return Promise.resolve(jsonResponse(innlandetConfig))
    if (url === '/api/kommuner') {
      return opts.kommunerDown
        ? Promise.resolve(jsonResponse({ title: 'Registeret er nede' }, 503))
        : Promise.resolve(jsonResponse(kommuner))
    }
    if (url === '/api/config/discovery' && method === 'PUT') {
      return opts.put === 'fail'
        ? Promise.resolve(jsonResponse({ title: 'Kunne ikke skrive hugin.json' }, 500))
        : Promise.resolve(jsonResponse(innlandetConfig))
    }
    if (url === '/api/sync' && method === 'POST')
      return Promise.resolve(new Response(null, { status: 202 }))
    return Promise.reject(new Error(`unhandled ${method} ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('FirstRunDialog v2', () => {
  it('prefills the cascade from the server scope and lists the fylke’s kommuner', async () => {
    fakeServer()
    render(<FirstRunDialog open onSaveFocus={() => {}} onDone={() => {}} onDismiss={() => {}} />)

    expect(await screen.findByRole('group', { name: 'Kommuner i Innlandet' })).toBeInTheDocument()
    expect(screen.getByLabelText('Fylke')).toHaveValue('34')
    expect(within(screen.getByLabelText('Fylke')).getAllByRole('option')).toHaveLength(
      FYLKER.size + 1
    )
    expect(screen.getByRole('checkbox', { name: 'Hamar' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Lillehammer' })).toBeChecked()
  })

  it('Start PUTs the scope, seeds the focus, triggers a sync and reports done', async () => {
    const calls = fakeServer()
    const user = userEvent.setup()
    const onSaveFocus = vi.fn()
    const onDone = vi.fn()
    render(<FirstRunDialog open onSaveFocus={onSaveFocus} onDone={onDone} onDismiss={() => {}} />)
    await screen.findByRole('group', { name: 'Kommuner i Innlandet' })

    await user.click(screen.getByRole('checkbox', { name: 'Hamar' })) // leaves only Lillehammer
    await user.click(screen.getByRole('checkbox', { name: 'Utvikling' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const put = calls.find((c) => c.method === 'PUT')
    expect(put?.body).toEqual({ municipalityNumbers: ['3405'], fylker: [], allOfNorway: false })
    expect(onSaveFocus).toHaveBeenCalledWith({
      fylke: '34',
      kommune: '3405',
      categories: ['Utvikling'],
    })
    expect(calls.some((c) => c.url === '/api/sync' && c.method === 'POST')).toBe(true)
  })

  it('a failed PUT still seeds the focus, shows a retryable alert and stays open', async () => {
    fakeServer({ put: 'fail' })
    const user = userEvent.setup()
    const onSaveFocus = vi.fn()
    const onDone = vi.fn()
    render(<FirstRunDialog open onSaveFocus={onSaveFocus} onDone={onDone} onDismiss={() => {}} />)
    await screen.findByRole('group', { name: 'Kommuner i Innlandet' })

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kunne ikke lagre dekningen: Kunne ikke skrive hugin.json'
    )
    expect(onSaveFocus).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('degrades to fylke-only when /api/kommuner is unreachable', async () => {
    fakeServer({ kommunerDown: true })
    render(<FirstRunDialog open onSaveFocus={() => {}} onDone={() => {}} onDismiss={() => {}} />)

    expect(await screen.findByText(/Kommunelisten er ikke tilgjengelig/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Kommuner i/ })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Kategorier' })).toBeInTheDocument()
  })

  it('calls onDismiss (nothing else) on a native close, e.g. Escape', async () => {
    const calls = fakeServer()
    const onDismiss = vi.fn()
    const onSaveFocus = vi.fn()
    render(
      <FirstRunDialog open onSaveFocus={onSaveFocus} onDone={() => {}} onDismiss={onDismiss} />
    )
    await screen.findByRole('group', { name: 'Kommuner i Innlandet' })

    screen.getByRole('dialog').dispatchEvent(new Event('close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSaveFocus).not.toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })
})
