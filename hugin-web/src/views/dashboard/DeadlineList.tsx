import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useAnnounce } from '../../components/LiveRegion'
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard'
import { adMatchesFocus, useFocus } from '../../context/focus'
import { useReadOnly } from '../../context/readOnly'
import { type T, useT } from '../../i18n'
import { ApiError } from '../../lib/api'
import { displayCompanyName } from '../../lib/companyName'
import { formatDate } from '../../lib/dates'
import { useSavePipelineEntry, useSetAdHidden, useSetAdLink } from '../../lib/mutations'
import { pipelineLabel } from '../../lib/pipelineLabels'
import { adsQuery, pipelineQuery } from '../../lib/queries'
import type { AdDto, PipelineDto } from '../../lib/types'

function urgencyClass(daysLeft: number | null): string | undefined {
  if (daysLeft === null) return undefined
  if (daysLeft <= 3) return 'frist-rod'
  if (daysLeft <= 7) return 'frist-gul'
  return undefined
}

/** Badge treatment for the days-left chip, layered with the urgency color class above. */
function daysLeftBadgeClass(daysLeft: number | null): string {
  const badge =
    daysLeft === null
      ? 'badge'
      : daysLeft <= 3
        ? 'badge badge-danger'
        : daysLeft <= 7
          ? 'badge badge-warning'
          : 'badge'
  const urgency = urgencyClass(daysLeft)
  return urgency ? `${badge} ${urgency}` : badge
}

function daysLeftText(daysLeft: number | null, t: T): string {
  if (daysLeft === null) return t('deadlines.none')
  if (daysLeft < 0) return t('deadlines.expiredBadge')
  if (daysLeft === 0) return t('deadlines.todayBadge')
  if (daysLeft === 1) return t('deadlines.dayBadgeOne')
  return t('deadlines.daysBadge', { n: daysLeft })
}

function formatExpires(expires: string | null): string | null {
  return expires ? formatDate(expires) : null
}

export type Show = 'active' | 'all'

interface DeadlineListProps {
  show: Show
  onShowChange: (show: Show) => void
}

export function DeadlineList({ show, onShowChange }: DeadlineListProps) {
  const queryClient = useQueryClient()
  const t = useT()
  // Switching the filter keeps the previous rows on screen until the new list arrives.
  const {
    data: ads = [],
    isError: loadFailed,
    refetch,
  } = useQuery({ ...adsQuery(show === 'all'), placeholderData: keepPreviousData })
  // Every row action refetches the ads lists on success (this one and the dashboard's
  // NeedsAction share the cache).
  const setHidden = useSetAdHidden()
  const setLink = useSetAdLink()
  const trackCompany = useSavePipelineEntry()
  const [actionError, setActionError] = useState<string | null>(null)
  const error = actionError ?? (loadFailed ? t('deadlines.loadError') : null)
  // The manual link form: which row has it open, the chosen orgnr, and the tracked companies
  // it offers (fetched afresh on every open, so a company tracked since is offered too; null
  // while loading, which keeps the form off-screen until the list is there).
  const [linking, setLinking] = useState<string | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [tracked, setTracked] = useState<PipelineDto[] | null>(null)
  // Opening the form picks nothing; only a chosen company is something to lose.
  const linkDirty = linking !== null && linkTarget !== ''
  const announce = useAnnounce()
  const { focus } = useFocus()
  const { readOnly } = useReadOnly()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const skjulRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // The link form replaces the button that opens it, so focus is moved by hand: into the select
  // when the form appears, back to that row's «Koble til bedrift» when it closes without a
  // request (returnFocusTo names the row). A completed link or unlink goes through moveFocus
  // instead, since the button that had focus is gone after the reload.
  const linkRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const linkSelectRef = useRef<HTMLSelectElement>(null)
  const returnFocusTo = useRef<string | null>(null)

  // Moved once the action has succeeded — the mutation resolves only after its refetch has landed.
  // null focuses the heading; a feedId focuses that row's Skjul button (which every action keeps).
  const moveFocus = (target: string | null) => {
    const button = target ? skjulRefs.current.get(target) : undefined
    if (button) button.focus()
    else headingRef.current?.focus()
  }

  useEffect(() => {
    if (linking !== null) {
      if (tracked !== null) linkSelectRef.current?.focus()
      return
    }
    const target = returnFocusTo.current
    if (target === null) return
    returnFocusTo.current = null
    linkRefs.current.get(target)?.focus()
  }, [linking, tracked])

  const visibleAds = ads.filter((ad) => adMatchesFocus(ad, focus))

  const handleSkjul = async (feedId: string) => {
    const index = visibleAds.findIndex((a) => a.feedId === feedId)
    const nextFeedId = visibleAds[index + 1]?.feedId ?? null
    try {
      await setHidden.mutateAsync({ feedId, hidden: true })
    } catch {
      setActionError(t('deadlines.hideError'))
      return
    }
    setActionError(null)
    moveFocus(nextFeedId)
    announce(t('deadlines.hiddenAnnounce'))
  }

  const handleTrack = async (ad: AdDto) => {
    if (!ad.employerOrgnr) return
    try {
      await trackCompany.mutateAsync({ orgnr: ad.employerOrgnr, status: 'active' })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('deadlines.trackError'))
      return
    }
    setActionError(null)
    const displayName = ad.employer ? displayCompanyName(ad.employer) : ad.employerOrgnr
    announce(t('deadlines.trackedAnnounce', { name: displayName }))
  }

  const handleAngreSkjul = async (feedId: string) => {
    try {
      await setHidden.mutateAsync({ feedId, hidden: false })
    } catch {
      setActionError(t('deadlines.unhideError'))
      return
    }
    setActionError(null)
    announce(t('deadlines.unhiddenAnnounce'))
  }

  const openLink = async (feedId: string) => {
    setLinking(feedId)
    setLinkTarget('')
    setTracked(null)
    try {
      // Fetched afresh on every open (the default staleTime is 0), so a company tracked since is offered.
      const entries = await queryClient.fetchQuery(pipelineQuery())
      setTracked(
        [...entries].sort((a, b) =>
          displayCompanyName(a.companyName).localeCompare(displayCompanyName(b.companyName), 'nb')
        )
      )
    } catch {
      setActionError(t('deadlines.linkError'))
      returnFocusTo.current = feedId
      setLinking(null)
    }
  }

  const closeLink = (feedId: string) => {
    returnFocusTo.current = feedId
    setLinking(null)
    setLinkTarget('')
  }

  const handleLink = async (feedId: string) => {
    const target = tracked?.find((c) => c.orgnr === linkTarget)
    if (!target) return
    try {
      await setLink.mutateAsync({ feedId, orgnr: target.orgnr })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('deadlines.linkError'))
      return
    }
    setActionError(null)
    setLinking(null)
    setLinkTarget('')
    moveFocus(feedId)
    announce(t('deadlines.linkedAnnounce', { name: displayCompanyName(target.companyName) }))
  }

  const handleUnlink = async (feedId: string) => {
    try {
      await setLink.mutateAsync({ feedId, orgnr: null })
    } catch {
      setActionError(t('deadlines.unlinkError'))
      return
    }
    setActionError(null)
    moveFocus(feedId)
    announce(t('deadlines.unlinkedAnnounce'))
  }

  return (
    <section aria-labelledby="deadlines-heading" className="deadline-list card stack">
      <h2 id="deadlines-heading" ref={headingRef} tabIndex={-1}>
        {t('deadlines.heading')}
      </h2>
      <p className="text-muted">{t('deadlines.description')}</p>
      <div className="field">
        <label className="label" htmlFor="deadlines-show">
          {t('deadlines.showLabel')}
        </label>
        <select
          id="deadlines-show"
          className="select"
          value={show}
          onChange={(event) => {
            setActionError(null)
            onShowChange(event.target.value as Show)
          }}
        >
          <option value="active">{t('deadlines.showDefault')}</option>
          <option value="all">{t('deadlines.showAll')}</option>
        </select>
      </div>
      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setActionError(null)
              refetch()
            }}
          >
            {t('common.retry')}
          </button>
        </p>
      )}
      <ul className="stack stack-sm">
        {visibleAds.map((ad) => (
          <li key={ad.feedId} className="frist-row">
            <div className="stack stack-sm">
              {ad.sourceUrl ? (
                <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {ad.title}
                </a>
              ) : (
                <span>{ad.title}</span>
              )}
              <span className="text-muted">
                {ad.employer ? displayCompanyName(ad.employer) : ad.employer}
              </span>
            </div>
            <div className="frist-meta">
              <span className="text-muted">{formatExpires(ad.expires)}</span>
              <span className={daysLeftBadgeClass(ad.daysLeft)}>
                {daysLeftText(ad.daysLeft, t)}
              </span>
              <span className="frist-category text-muted">{ad.category}</span>
            </div>
            <div className="cluster cluster-sm">
              {ad.pipelineStatus && (
                <span className="badge badge-accent">{pipelineLabel(t, ad.pipelineStatus)}</span>
              )}
              {!readOnly && ad.linkedOrgnr && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleUnlink(ad.feedId)}
                >
                  {t('deadlines.unlink')}
                </button>
              )}
              {!readOnly && !ad.pipelineStatus && ad.employerOrgnr && (
                <button type="button" className="btn btn-ghost" onClick={() => handleTrack(ad)}>
                  {t('deadlines.track')}
                </button>
              )}
              {!readOnly && !ad.pipelineStatus && linking !== ad.feedId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  ref={(el) => {
                    if (el) linkRefs.current.set(ad.feedId, el)
                    else linkRefs.current.delete(ad.feedId)
                  }}
                  onClick={() => openLink(ad.feedId)}
                >
                  {t('deadlines.link')}
                </button>
              )}
              {!readOnly &&
                (ad.hidden ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => handleAngreSkjul(ad.feedId)}
                  >
                    {t('deadlines.undoHide')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    ref={(el) => {
                      if (el) skjulRefs.current.set(ad.feedId, el)
                      else skjulRefs.current.delete(ad.feedId)
                    }}
                    onClick={() => handleSkjul(ad.feedId)}
                  >
                    {t('deadlines.hide')}
                  </button>
                ))}
            </div>
            {linking === ad.feedId && tracked !== null && (
              <div className="frist-link cluster cluster-sm">
                <div className="field">
                  <label className="label" htmlFor={`frist-link-${ad.feedId}`}>
                    {t('deadlines.linkLabel')}
                  </label>
                  <select
                    id={`frist-link-${ad.feedId}`}
                    ref={linkSelectRef}
                    className="select"
                    value={linkTarget}
                    onChange={(event) => setLinkTarget(event.target.value)}
                  >
                    <option value="">{t('deadlines.linkPlaceholder')}</option>
                    {tracked.map((c) => (
                      <option key={c.orgnr} value={c.orgnr}>
                        {displayCompanyName(c.companyName)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!linkTarget}
                  onClick={() => handleLink(ad.feedId)}
                >
                  {t('deadlines.linkConfirm')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => closeLink(ad.feedId)}
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <UnsavedChangesGuard dirty={linkDirty} />
    </section>
  )
}
