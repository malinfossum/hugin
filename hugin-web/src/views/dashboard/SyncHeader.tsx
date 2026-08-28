import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../../api'
import { useAnnounce } from '../../components/LiveRegion'
import { formatDateTime } from '../../dates'
import { type T, useT } from '../../i18n'
import type { SourceResultDto, SourceStateDto, StatusDto, SyncRunStatus } from '../../types'

function formatLastSync(source: SourceStateDto | null | undefined, t: T): string {
  return source ? formatDateTime(source.lastSyncUtc) : t('sync.never')
}

/** null when no source failed; otherwise the message shared by the announce and the banner. */
function getFailureMessage(sync: SyncRunStatus, t: T): string | null {
  const failed = [sync.brreg, sync.nav].filter((r): r is SourceResultDto => !!r && !r.succeeded)
  if (failed.length === 0) return null
  if (failed.length === 2) return t('sync.failedFull', { error: failed[0]?.error ?? '' })
  return t('sync.failedPartial', { error: failed[0]?.error ?? '' })
}

export function SyncHeader({ onSyncCompleted }: { onSyncCompleted: () => void }) {
  const [status, setStatus] = useState<StatusDto | null>(null)
  const [sync, setSync] = useState<SyncRunStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const announce = useAnnounce()
  const t = useT()
  const wasRunning = useRef(false)

  const loadStatus = useCallback(() => {
    setLoadError(null)
    return api
      .get<StatusDto>('/api/status')
      .then(setStatus)
      .catch(() => setLoadError(t('sync.statusError')))
  }, [t])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // INVARIANT: polling must survive/resume after a completed sync regardless of parent
  // memoization of onSyncCompleted. The interval is never stopped on completion — only on
  // unmount — so a later "Synk nå" click is always picked up by the next 2s tick without
  // depending on the parent handing us a new callback identity to re-trigger this effect.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const poll = async () => {
      const s = await api.get<SyncRunStatus>('/api/sync/status').catch(() => null)
      if (!s) return
      setSync(s)
      if (wasRunning.current && !s.running) {
        wasRunning.current = false
        announce(getFailureMessage(s, t) ?? t('sync.done'))
        loadStatus()
        onSyncCompleted()
      }
      if (s.running) wasRunning.current = true
    }
    poll()
    timer = setInterval(poll, 2000)
    return () => clearInterval(timer)
  }, [announce, loadStatus, onSyncCompleted, t])

  const startSync = async () => {
    try {
      await api.post('/api/sync')
      wasRunning.current = true
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        announce(t('sync.alreadyRunning'))
        wasRunning.current = true
      } else {
        announce(t('sync.startFailed'))
      }
    }
  }

  const failureMessage = sync && !sync.running ? getFailureMessage(sync, t) : null

  return (
    <header className="sync-header card stack">
      <h2 className="visually-hidden">{t('sync.heading')}</h2>
      <dl className="sync-times cluster text-muted">
        <div>
          <dt>{t('sync.brregLabel')}</dt>
          <dd>{formatLastSync(status?.brreg, t)}</dd>
        </div>
        <div>
          <dt>{t('sync.navLabel')}</dt>
          <dd>{formatLastSync(status?.nav, t)}</dd>
        </div>
      </dl>
      <p className="sync-counts text-muted">
        {t('sync.counts', {
          activeAds: status?.activeAds ?? 0,
          companies: status?.companies ?? 0,
          pipelineEntries: status?.pipelineEntries ?? 0,
        })}
      </p>
      {loadError && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {loadError}
          <button type="button" className="btn btn-ghost" onClick={loadStatus}>
            {t('common.retry')}
          </button>
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={startSync}
        disabled={sync?.running ?? false}
      >
        {sync?.running ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {t('sync.syncing')}
          </>
        ) : (
          t('sync.now')
        )}
      </button>
      {failureMessage && (
        <p role="status" className="alert alert-danger">
          {failureMessage}
        </p>
      )}
    </header>
  )
}
