import { useQuery } from '@tanstack/react-query'
import { useAnnounce } from '../../components/LiveRegion'
import { useSyncWatcher } from '../../components/SyncWatcher'
import { useReadOnly } from '../../context/readOnly'
import { type T, useT } from '../../i18n'
import { ApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/dates'
import { useStartSync } from '../../lib/mutations'
import { statusQuery, syncStatusQuery } from '../../lib/queries'
import { getFailureMessage, isNoCoverageFailure } from '../../lib/syncResult'
import type { SourceStateDto } from '../../lib/types'

function formatLastSync(source: SourceStateDto | null | undefined, t: T): string {
  return source ? formatDateTime(source.lastSyncUtc) : t('sync.never')
}

interface SyncHeaderProps {
  /** Reopens the first-run dialog — the empty-coverage prompt's own button (v3.5 Part A4). */
  onRequestCoverage: () => void
}

/** Last-sync times, counts and the "Synk nå" button. The completion cycle (announce, refresh)
 * lives in the shell's SyncWatcherProvider, so it runs whichever view is showing. */
export function SyncHeader({ onRequestCoverage }: SyncHeaderProps) {
  const { data: status, isError: statusFailed, refetch: loadStatus } = useQuery(statusQuery())
  const { data: sync = null } = useQuery(syncStatusQuery())
  const announce = useAnnounce()
  const t = useT()
  const { readOnly } = useReadOnly()
  const { markSyncStarted } = useSyncWatcher()
  const startSyncMutation = useStartSync()

  const startSync = async () => {
    try {
      await startSyncMutation.mutateAsync({})
      markSyncStarted()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        announce(t('sync.alreadyRunning'))
        markSyncStarted()
      } else {
        announce(t('sync.startFailed'))
      }
    }
  }

  const noCoverage = !readOnly && sync && !sync.running ? isNoCoverageFailure(sync) : false
  const failureMessage = sync && !sync.running && !noCoverage ? getFailureMessage(sync, t) : null

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
      {statusFailed && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {t('sync.statusError')}
          <button type="button" className="btn btn-ghost" onClick={() => loadStatus()}>
            {t('common.retry')}
          </button>
        </p>
      )}
      {!readOnly && (
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
      )}
      {noCoverage && (
        <p role="status" className="alert alert-warning cluster cluster-sm">
          {t('dashboard.noCoverageMessage')}
          <button type="button" className="btn btn-ghost" onClick={onRequestCoverage}>
            {t('dashboard.noCoverageButton')}
          </button>
        </p>
      )}
      {failureMessage && (
        <p role="status" className="alert alert-danger">
          {failureMessage}
        </p>
      )}
    </header>
  )
}
