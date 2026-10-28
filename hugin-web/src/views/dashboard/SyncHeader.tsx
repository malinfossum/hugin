import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Info, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAnnounce } from '../../components/LiveRegion'
import { useSyncWatcher } from '../../components/SyncWatcher'
import { Button } from '../../components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '../../components/ui/popover'
import { useReadOnly } from '../../context/readOnly'
import { type T, useT } from '../../i18n'
import { ApiError } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useMarkSeen, useStartSync } from '../../lib/mutations'
import { newQuery, statusQuery, syncStatusQuery } from '../../lib/queries'
import { getFailureMessage, isNoCoverageFailure } from '../../lib/syncResult'
import type { NewDto, SourceStateDto } from '../../lib/types'

function formatLastSync(source: SourceStateDto | null | undefined, t: T): string {
  return source ? formatDateTime(source.lastSyncUtc) : t('sync.never')
}

/** The delta, as the dashboard's headline: what arrived since the last "Mark as seen". The
 * counts are set in forest (DESIGN.md: forest is new), the words around them in ink. */
function DeltaHeadline({ delta, t }: { delta: NewDto; t: T }) {
  const since = formatDate(delta.since)
  const ads = delta.ads.length
  const companies = delta.companies.length
  if (ads === 0 && companies === 0) return <>{t('sync.deltaNone', { date: since })}</>
  const ad = ads > 0 && (
    <>
      <span className="text-forest">{ads}</span>{' '}
      {t(ads === 1 ? 'sync.deltaAdOne' : 'sync.deltaAds')}
    </>
  )
  const company = companies > 0 && (
    <>
      <span className="text-forest">{companies}</span>{' '}
      {t(companies === 1 ? 'sync.deltaCompanyOne' : 'sync.deltaCompanies')}
    </>
  )
  return (
    <>
      {ad}
      {ad && company && ` ${t('sync.deltaAnd')} `}
      {company} {t('sync.deltaSince', { date: since })}
    </>
  )
}

interface SyncHeaderProps {
  /** Reopens the first-run dialog: the empty-coverage prompt's own button (v3.5 Part A4). */
  onRequestCoverage: () => void
}

/** The dashboard's head: the delta headline, last-sync times and counts, and "Synk nå". The
 * completion cycle (announce, refresh) lives in the shell's SyncWatcherProvider, so it runs
 * whichever view is showing. */
export function SyncHeader({ onRequestCoverage }: SyncHeaderProps) {
  const { data: status, isError: statusFailed, refetch: loadStatus } = useQuery(statusQuery())
  const { data: sync = null } = useQuery(syncStatusQuery())
  // The same cached query the "new since last visit" list reads; null before the first sync.
  const { data: delta } = useQuery(newQuery())
  const announce = useAnnounce()
  const t = useT()
  const { readOnly } = useReadOnly()
  const { markSyncStarted } = useSyncWatcher()
  const startSyncMutation = useStartSync()
  const markSeen = useMarkSeen()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)
  // The asOf the user was looking at when they opened the confirm. A refetch (a sync finishing)
  // while it is open must not change what gets posted: that would mark unreviewed items seen.
  const reviewedAsOf = useRef<string | null>(null)
  const hasNew = !!delta && (delta.ads.length > 0 || delta.companies.length > 0)

  const confirmMarkSeen = async () => {
    const asOf = reviewedAsOf.current
    if (!asOf) return
    setConfirmOpen(false)
    try {
      await markSeen.mutateAsync(asOf)
    } catch {
      setMarkError(t('newSince.markError'))
      return
    }
    reviewedAsOf.current = null
    setMarkError(null)
    // The mutation resolves once the refetch has landed: the headline now reads the new delta.
    headingRef.current?.focus()
    announce(t('newSince.markedAnnounce'))
  }

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
    <section
      aria-labelledby="sync-heading"
      className="flex flex-col gap-y-2.5 pt-6 font-sans md:pt-10"
    >
      <div className="flex flex-col gap-x-10 gap-y-4 md:flex-row md:items-end">
        <div className="flex flex-1 flex-col gap-2.5">
          {delta ? (
            <h2
              id="sync-heading"
              ref={headingRef}
              tabIndex={-1}
              className="max-w-xl font-heading text-2xl font-semibold text-balance md:text-headline"
            >
              <DeltaHeadline delta={delta} t={t} />
            </h2>
          ) : (
            <h2 id="sync-heading" ref={headingRef} tabIndex={-1} className="sr-only">
              {t('sync.heading')}
            </h2>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
            <dl className="flex flex-wrap gap-x-4 gap-y-1">
              <div className="flex gap-1.5">
                <dt>{t('sync.brregLabel')}</dt>
                <dd className="font-medium text-foreground">{formatLastSync(status?.brreg, t)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>{t('sync.navLabel')}</dt>
                <dd className="font-medium text-foreground">{formatLastSync(status?.nav, t)}</dd>
              </div>
            </dl>
            <p>
              {t('sync.counts', {
                activeAds: status?.activeAds ?? 0,
                companies: status?.companies ?? 0,
                pipelineEntries: status?.pipelineEntries ?? 0,
              })}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              size="touch"
              className="flex-1 md:flex-none"
              onClick={startSync}
              disabled={sync?.running ?? false}
            >
              <RefreshCw
                aria-hidden="true"
                className={sync?.running ? 'animate-spin' : undefined}
              />
              {sync?.running ? t('sync.syncing') : t('sync.now')}
            </Button>
            {hasNew && (
              <Popover
                open={confirmOpen}
                onOpenChange={(open) => {
                  if (open && delta) reviewedAsOf.current = delta.asOf
                  if (!open) reviewedAsOf.current = null
                  setConfirmOpen(open)
                }}
              >
                <PopoverTrigger render={<Button size="touch" className="flex-1 md:flex-none" />}>
                  <Check aria-hidden="true" />
                  {t('newSince.markSeen')}
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <PopoverTitle>{t('newSince.confirmTitle')}</PopoverTitle>
                  <PopoverDescription>{t('newSince.confirmDetail')}</PopoverDescription>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="touch" onClick={() => setConfirmOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button size="touch" onClick={confirmMarkSeen}>
                      {t('newSince.markSeen')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>
      {statusFailed && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {t('sync.statusError')}
          <Button variant="link" className="min-h-11" onClick={() => loadStatus()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      {noCoverage && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <Info aria-hidden="true" className="size-4 text-muted-foreground" />
          {t('dashboard.noCoverageMessage')}
          <Button variant="link" className="min-h-11" onClick={onRequestCoverage}>
            {t('dashboard.noCoverageButton')}
          </Button>
        </p>
      )}
      {markError && (
        <p
          role="status"
          className="flex items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {markError}
        </p>
      )}
      {failureMessage && (
        <p
          role="status"
          className="flex items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {failureMessage}
        </p>
      )}
    </section>
  )
}
