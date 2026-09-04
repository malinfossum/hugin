import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadOnlyProvider, useReadOnly } from './readOnly'

function Probe() {
  const { readOnly, resolved } = useReadOnly()
  return <p>{`resolved=${resolved} readOnly=${readOnly}`}</p>
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
    expect(screen.getByText('resolved=false readOnly=false')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('resolved=true readOnly=true')).toBeInTheDocument())
  })

  it('stays unresolved when /api/status fails', async () => {
    vi.stubGlobal('fetch', statusServer({ title: 'boom' }, false))
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>
    )
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.getByText('resolved=false readOnly=false')).toBeInTheDocument()
  })
})
