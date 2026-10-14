import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { queryKeys } from '../lib/queries'
import { makeQueryClient } from '../lib/queryClient'
import type { DiscoveryConfigDto } from '../lib/types'
import { TestQueryProvider } from '../test-utils'
import { CoverageSection } from './CoverageSection'
import { LiveRegionProvider } from './LiveRegion'

function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  })
}

const HAMAR = { name: 'Hamar', number: '3403' }
const LILLEHAMMER = { name: 'Lillehammer', number: '3405' }

/** A server that keeps its scope: a PUT writes the requested kommuner and answers with them. */
function fakeServer(scope: DiscoveryConfigDto) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    if (url === '/api/config/discovery' && method === 'GET') {
      return Promise.resolve(jsonResponse(scope))
    }
    if (url === '/api/config/discovery' && method === 'PUT') {
      const body = JSON.parse(init?.body as string) as { municipalityNumbers: string[] }
      scope.municipalities = [HAMAR, LILLEHAMMER].filter((m) =>
        body.municipalityNumbers.includes(m.number)
      )
      return Promise.resolve(jsonResponse(scope))
    }
    if (url === '/api/kommuner') return Promise.resolve(jsonResponse([HAMAR, LILLEHAMMER]))
    if (url === '/api/sync' && method === 'POST')
      return Promise.resolve(jsonResponse(undefined, 202))
    return Promise.reject(new Error(`unhandled request ${method} ${url}`))
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('CoverageSection', () => {
  it('a save ends the draft, so a later change on the server shows instead of the old edit', async () => {
    const scope: DiscoveryConfigDto = { municipalities: [HAMAR], fylker: [], allOfNorway: false }
    vi.stubGlobal('fetch', fakeServer(scope))
    const client = makeQueryClient()
    const user = userEvent.setup()
    render(
      <TestQueryProvider client={client}>
        <LanguageProvider>
          <LiveRegionProvider>
            <CoverageSection />
          </LiveRegionProvider>
        </LanguageProvider>
      </TestQueryProvider>
    )
    const section = await screen.findByRole('region', { name: 'Dekning' })
    const lillehammer = await within(section).findByRole('checkbox', { name: 'Lillehammer' })

    await user.click(lillehammer)
    await user.click(within(section).getByRole('button', { name: 'Lagre dekning' }))
    expect(await screen.findByText('Lagret — synkroniserer …')).toBeInTheDocument()
    expect(within(section).getByRole('checkbox', { name: 'Hamar' })).toBeChecked()
    expect(lillehammer).toBeChecked()

    // The scope changes elsewhere (another tab, the first-run dialog). A leftover draft would
    // keep showing Hamar checked over it.
    scope.municipalities = [LILLEHAMMER]
    await act(() => client.invalidateQueries({ queryKey: queryKeys.discovery }))

    await waitFor(() =>
      expect(within(section).getByRole('checkbox', { name: 'Hamar' })).not.toBeChecked()
    )
    expect(lillehammer).toBeChecked()
  })
})
