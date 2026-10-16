import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { queryKeys } from '../lib/queries'
import { makeQueryClient } from '../lib/queryClient'
import { TestQueryProvider } from '../test-utils'
import { AppFooter } from './AppFooter'

const STATUS = {
  brreg: null,
  nav: null,
  reviewMark: null,
  activeAds: 0,
  companies: 0,
  pipelineEntries: 0,
  readOnly: false,
  scopeConfigured: true,
  version: 'v3.10.0',
}

function renderFooter(status: 'ok' | 'fail') {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url !== '/api/status') return Promise.reject(new Error(`unhandled request ${url}`))
    return Promise.resolve(
      status === 'ok'
        ? new Response(JSON.stringify(STATUS), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('boom', { status: 500 })
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  const client = makeQueryClient()
  render(
    <TestQueryProvider client={client}>
      <LanguageProvider>
        <AppFooter />
      </LanguageProvider>
    </TestQueryProvider>
  )
  return { client, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.removeItem('hugin-lang')
})

describe('AppFooter', () => {
  it('shows the version the status query reports, in a contentinfo landmark', async () => {
    renderFooter('ok')

    const footer = screen.getByRole('contentinfo')
    expect(await within(footer).findByText('Hugin v3.10.0')).toBeInTheDocument()
  })

  it('leaves the version out when the status fetch fails, and keeps the rest', async () => {
    const { client } = renderFooter('fail')

    await waitFor(() => expect(client.getQueryState(queryKeys.status)?.status).toBe('error'))
    expect(screen.queryByText(/^Hugin/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Annonser fra NAV · Bedriftsdata fra Brønnøysundregistrene (NLOD)'
    )
  })

  it('links the repo and the bokmål NLOD licence in a new tab without a referrer', async () => {
    renderFooter('ok')

    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github).toHaveAttribute('href', 'https://github.com/malinfossum/hugin')
    const nlod = screen.getByRole('link', { name: 'NLOD' })
    expect(nlod).toHaveAttribute('href', 'https://data.norge.no/nlod/no/2.0')
    for (const link of [github, nlod]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    await screen.findByText('Hugin v3.10.0')
  })

  it('reads in English with the English licence page', async () => {
    window.localStorage.setItem('hugin-lang', 'en')
    renderFooter('ok')

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Ads from NAV · Company data from the Brønnøysund Register Centre (NLOD)'
    )
    expect(screen.getByRole('link', { name: 'NLOD' })).toHaveAttribute(
      'href',
      'https://data.norge.no/nlod/en/2.0'
    )
    await screen.findByText('Hugin v3.10.0')
  })

  it('makes one status request, the shared one', async () => {
    const { fetchMock } = renderFooter('ok')

    await screen.findByText('Hugin v3.10.0')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
