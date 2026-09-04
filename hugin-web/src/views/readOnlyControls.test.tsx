import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider } from '../components/LiveRegion'
import { FocusProvider } from '../focus'
import { LanguageProvider } from '../i18n'
import { ReadOnlyProvider } from '../readOnly'
import { ApplicationsView } from './ApplicationsView'
import { FristerList } from './dashboard/FristerList'
import { NyttSidenSist } from './dashboard/NyttSidenSist'
import { SyncHeader } from './dashboard/SyncHeader'
import { SettingsView } from './SettingsView'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const AD = {
  feedId: 'a1',
  title: 'Utvikler',
  employer: 'TRETOEN AS',
  employerOrgnr: '922425620',
  kommune: '3403',
  expires: '2099-01-01T00:00:00Z',
  daysLeft: 30,
  category: 'IT / Utvikling',
  sourceUrl: 'https://example.org',
  pipelineStatus: null,
  hidden: false,
  isActive: true,
  published: '2026-09-01T00:00:00Z',
  linkedOrgnr: null,
}

const ENTRY = {
  orgnr: '922425620',
  companyName: 'TRETOEN AS',
  status: 'active',
  starred: false,
  why: 'Demo.',
  note: null,
  svar: null,
  updated: '2026-09-01T00:00:00Z',
  adsExpired: false,
}

function demoServer() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === '/api/status')
      return Promise.resolve(
        json({
          brreg: null,
          nav: null,
          reviewMark: null,
          activeAds: 1,
          companies: 1,
          pipelineEntries: 1,
          readOnly: true,
        })
      )
    if (url === '/api/sync/status')
      return Promise.resolve(
        json({ running: false, startedUtc: null, finishedUtc: null, brreg: null, nav: null })
      )
    if (url.startsWith('/api/ads')) return Promise.resolve(json([AD]))
    if (url.startsWith('/api/pipeline')) return Promise.resolve(json([ENTRY]))
    if (url === '/api/new')
      return Promise.resolve(
        json({
          companies: [],
          ads: [AD],
          since: '2026-08-28T00:00:00Z',
          asOf: '2026-09-04T00:00:00Z',
        })
      )
    if (url === '/api/sources')
      return Promise.resolve(json([{ id: 1, label: 'FINN', url: 'https://finn.no', position: 1 }]))
    if (url === '/api/companies') return Promise.resolve(json([]))
    if (url === '/api/config/discovery')
      return Promise.resolve(
        json({
          municipalities: [{ name: 'Hamar', number: '3403' }],
          fylker: [],
          allOfNorway: false,
        })
      )
    if (url === '/api/kommuner') return Promise.resolve(json([{ number: '3403', name: 'Hamar' }]))
    return Promise.reject(new Error(`unhandled ${url}`))
  })
}

function wrap(ui: React.ReactElement) {
  return render(
    <LanguageProvider>
      <ReadOnlyProvider>
        <FocusProvider>
          <LiveRegionProvider>{ui}</LiveRegionProvider>
        </FocusProvider>
      </ReadOnlyProvider>
    </LanguageProvider>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('read-only mode hides write controls', () => {
  it('SyncHeader has no «Synk nå»', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<SyncHeader onSyncCompleted={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Synkronisering/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Synk nå' })).not.toBeInTheDocument()
  })

  it('NyttSidenSist has no «Merk som sett»', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<NyttSidenSist refreshKey={0} />)
    await screen.findByText('Utvikler')
    expect(screen.queryByRole('button', { name: 'Merk som sett' })).not.toBeInTheDocument()
  })

  it('FristerList has no track, link or hide buttons', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<FristerList refreshKey={0} />)
    await screen.findByText('Utvikler')
    for (const name of ['Følg opp', 'Koble til bedrift', 'Skjul']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('ApplicationsView has no star or edit', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<ApplicationsView />)
    // displayCompanyName title-cases the raw all-caps "TRETOEN AS" from the fixture.
    await screen.findByText('Tretoen AS')
    expect(screen.queryByRole('button', { name: 'Gi stjerne' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rediger' })).not.toBeInTheDocument()
  })

  it('SettingsView shows sources and coverage without any editing', async () => {
    vi.stubGlobal('fetch', demoServer())
    wrap(<SettingsView theme="dark" onToggleTheme={() => {}} onSourcesChanged={() => {}} />)
    await screen.findByText('FINN')
    expect(screen.queryByRole('button', { name: 'Legg til lenke' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rediger' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fjern' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Lagre dekning' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('group', { name: /Dekning/ })).toBeDisabled()
  })
})
