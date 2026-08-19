import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useAnnounce } from '../../components/LiveRegion'
import type { SourceResultDto, SourceStateDto, StatusDto, SyncRunStatus } from '../../types'

function formatLastSync(source: SourceStateDto | null | undefined): string {
  if (!source) return 'Aldri'
  return new Date(source.lastSyncUtc).toLocaleString('nb-NO')
}

/** null when no source failed; otherwise the bokmål message shared by the announce and the banner. */
function getFailureMessage(sync: SyncRunStatus): string | null {
  const failed = [sync.brreg, sync.nav].filter((r): r is SourceResultDto => !!r && !r.succeeded)
  if (failed.length === 0) return null
  if (failed.length === 2) return `Synk feilet: ${failed[0]?.error}`
  return `Synk delvis feilet: ${failed[0]?.error}`
}

export function SyncHeader({ onSyncCompleted }: { onSyncCompleted: () => void }) {
  const [status, setStatus] = useState<StatusDto | null>(null)
  const [sync, setSync] = useState<SyncRunStatus | null>(null)
  const announce = useAnnounce()
  const wasRunning = useRef(false)

  const loadStatus = useCallback(() => {
    api
      .get<StatusDto>('/api/status')
      .then(setStatus)
      .catch(() => {})
  }, [])

  useEffect(loadStatus, [loadStatus])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = async () => {
      const s = await api.get<SyncRunStatus>('/api/sync/status').catch(() => null)
      if (!s) return
      setSync(s)
      if (wasRunning.current && !s.running) {
        wasRunning.current = false
        clearInterval(timer)
        announce(getFailureMessage(s) ?? 'Synk ferdig.')
        loadStatus()
        onSyncCompleted()
      }
      if (s.running) wasRunning.current = true
    }
    poll()
    timer = setInterval(poll, 2000)
    return () => clearInterval(timer)
  }, [announce, loadStatus, onSyncCompleted])

  const startSync = async () => {
    try {
      await api.post('/api/sync')
    } catch {
      announce('En synk kjører allerede.')
    }
    wasRunning.current = true
  }

  const failureMessage = sync && !sync.running ? getFailureMessage(sync) : null

  return (
    <header className="sync-header">
      <h2 className="visually-hidden">Synkronisering</h2>
      <dl className="sync-times">
        <div>
          <dt>Brreg</dt>
          <dd>{formatLastSync(status?.brreg)}</dd>
        </div>
        <div>
          <dt>NAV</dt>
          <dd>{formatLastSync(status?.nav)}</dd>
        </div>
      </dl>
      <p className="sync-counts">
        {status?.activeAds ?? 0} aktive annonser · {status?.companies ?? 0} bedrifter ·{' '}
        {status?.pipelineEntries ?? 0} i pipeline
      </p>
      <button type="button" onClick={startSync} disabled={sync?.running ?? false}>
        {sync?.running ? (
          <>
            <span className="spinner" aria-hidden="true" />
            synker …
          </>
        ) : (
          'Synk nå'
        )}
      </button>
      {status && status.linkouts.length > 0 && (
        <ul className="linkouts">
          {status.linkouts.map((linkout) => (
            <li key={linkout.url}>
              <a href={linkout.url} target="_blank" rel="noopener noreferrer">
                {linkout.label}
              </a>
            </li>
          ))}
        </ul>
      )}
      {failureMessage && (
        <p role="status" className="advarsel">
          {failureMessage}
        </p>
      )}
    </header>
  )
}
