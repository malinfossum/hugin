import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadOnlyProvider, useReadOnly } from './readOnly'

function Probe() {
  const { readOnly, resolved, scopeConfigured, markScopeConfigured } = useReadOnly()
  return (
    <>
      <p>{`resolved=${resolved} readOnly=${readOnly} scopeConfigured=${scopeConfigured}`}</p>
      <button type="button" onClick={markScopeConfigured}>
        mark
      </button>
    </>
  )
}

function statusServer(body: unknown, ok = true) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: ok ? 200 : 500,
        headers: { 'content-type': 'application/json' },
      })
    )
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('ReadOnlyProvider', () => {
  it('starts unresolved and writable, then reflects the server flag', async () => {
    vi.stubGlobal('fetch', statusServer({ readOnly: true }))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    expect(
      screen.getByText('resolved=false readOnly=false scopeConfigured=null')
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText('resolved=true readOnly=true scopeConfigured=undefined')
      ).toBeInTheDocument()
    )
  })

  it('stays unresolved when /api/status fails', async () => {
    vi.stubGlobal('fetch', statusServer({ title: 'boom' }, false))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(
      screen.getByText('resolved=false readOnly=false scopeConfigured=null')
    ).toBeInTheDocument()
  })

  it('carries scopeConfigured through from /api/status once resolved', async () => {
    vi.stubGlobal('fetch', statusServer({ readOnly: false, scopeConfigured: false }))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByText('resolved=true readOnly=false scopeConfigured=false')
      ).toBeInTheDocument()
    )
  })

  it('markScopeConfigured flips scopeConfigured to true immediately, without another /api/status round-trip (Task 11 finding 1)', async () => {
    const fetchMock = statusServer({ readOnly: false, scopeConfigured: false })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByText('resolved=true readOnly=false scopeConfigured=false')
      ).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: 'mark' }))

    expect(
      screen.getByText('resolved=true readOnly=false scopeConfigured=true')
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
