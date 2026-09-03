import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../../api'
import { displayCompanyName } from '../../companyName'
import { useAnnounce } from '../../components/LiveRegion'
import { formatDate } from '../../dates'
import { adMatchesFocus, useFocus } from '../../focus'
import { type T, useT } from '../../i18n'
import { pipelineLabel } from '../../pipelineLabels'
import type { AdDto, PipelineDto } from '../../types'

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
  if (daysLeft === null) return t('frister.none')
  if (daysLeft < 0) return t('frister.expiredBadge')
  if (daysLeft === 0) return t('frister.todayBadge')
  if (daysLeft === 1) return t('frister.dayBadgeOne')
  return t('frister.daysBadge', { n: daysLeft })
}

function formatExpires(expires: string | null): string | null {
  return expires ? formatDate(expires) : null
}

type Show = 'active' | 'all'

export function FristerList({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const [show, setShow] = useState<Show>('active')
  const [error, setError] = useState<string | null>(null)
  // The manual link form: which row has it open, the chosen orgnr, and the tracked companies
  // it offers (fetched once, the first time a form opens).
  const [linking, setLinking] = useState<string | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [tracked, setTracked] = useState<PipelineDto[] | null>(null)
  const announce = useAnnounce()
  const { focus } = useFocus()
  const t = useT()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const skjulRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // undefined: no pending focus move. null: focus the heading. string: focus that row's Skjul button.
  const pendingFocus = useRef<string | null | undefined>(undefined)

  const load = useCallback(() => {
    setError(null)
    const path = show === 'all' ? '/api/ads?hidden=true' : '/api/ads'
    return api
      .get<AdDto[]>(path)
      .then(setAds)
      .catch(() => setError(t('frister.loadError')))
  }, [show, t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshKey])

  // biome-ignore lint/correctness/useExhaustiveDependencies: ads is the refetch-completed signal that applies the pending focus move
  useEffect(() => {
    if (pendingFocus.current === undefined) return
    const target = pendingFocus.current
    pendingFocus.current = undefined
    const button = target ? skjulRefs.current.get(target) : undefined
    if (button) button.focus()
    else headingRef.current?.focus()
  }, [ads])

  const visibleAds = ads.filter((ad) => adMatchesFocus(ad, focus))

  const handleSkjul = async (feedId: string) => {
    const index = visibleAds.findIndex((a) => a.feedId === feedId)
    const nextFeedId = visibleAds[index + 1]?.feedId ?? null
    try {
      await api.post(`/api/ads/${feedId}/hide`)
    } catch {
      setError(t('frister.hideError'))
      return
    }
    pendingFocus.current = nextFeedId
    await load()
    announce(t('frister.hiddenAnnounce'))
  }

  const handleTrack = async (ad: AdDto) => {
    if (!ad.employerOrgnr) return
    try {
      await api.put(`/api/pipeline/${ad.employerOrgnr}`, { status: 'active' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('frister.trackError'))
      return
    }
    await load()
    const displayName = ad.employer ? displayCompanyName(ad.employer) : ad.employerOrgnr
    announce(t('frister.trackedAnnounce', { name: displayName }))
  }

  const handleAngreSkjul = async (feedId: string) => {
    try {
      await api.del(`/api/ads/${feedId}/hide`)
    } catch {
      setError(t('frister.unhideError'))
      return
    }
    await load()
    announce(t('frister.unhiddenAnnounce'))
  }

  const openLink = async (feedId: string) => {
    setLinking(feedId)
    setLinkTarget('')
    if (tracked !== null) return
    try {
      const entries = await api.get<PipelineDto[]>('/api/pipeline')
      setTracked(
        [...entries].sort((a, b) =>
          displayCompanyName(a.companyName).localeCompare(displayCompanyName(b.companyName), 'nb')
        )
      )
    } catch {
      setError(t('frister.linkError'))
      setLinking(null)
    }
  }

  const closeLink = () => {
    setLinking(null)
    setLinkTarget('')
  }

  const handleLink = async (feedId: string) => {
    const target = tracked?.find((c) => c.orgnr === linkTarget)
    if (!target) return
    try {
      await api.put(`/api/ads/${feedId}/link`, { orgnr: target.orgnr })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('frister.linkError'))
      return
    }
    closeLink()
    await load()
    announce(t('frister.linkedAnnounce', { name: displayCompanyName(target.companyName) }))
  }

  const handleUnlink = async (feedId: string) => {
    try {
      await api.del(`/api/ads/${feedId}/link`)
    } catch {
      setError(t('frister.unlinkError'))
      return
    }
    await load()
    announce(t('frister.unlinkedAnnounce'))
  }

  return (
    <section aria-labelledby="frister-heading" className="frister-list card stack">
      <h2 id="frister-heading" ref={headingRef} tabIndex={-1}>
        {t('frister.heading')}
      </h2>
      <div className="field">
        <label className="label" htmlFor="frister-show">
          {t('frister.showLabel')}
        </label>
        <select
          id="frister-show"
          className="select"
          value={show}
          onChange={(event) => setShow(event.target.value as Show)}
        >
          <option value="active">{t('frister.showDefault')}</option>
          <option value="all">{t('frister.showAll')}</option>
        </select>
      </div>
      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
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
              {ad.linkedOrgnr && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleUnlink(ad.feedId)}
                >
                  {t('frister.unlink')}
                </button>
              )}
              {!ad.pipelineStatus && ad.employerOrgnr && (
                <button type="button" className="btn btn-ghost" onClick={() => handleTrack(ad)}>
                  {t('frister.track')}
                </button>
              )}
              {!ad.pipelineStatus && linking !== ad.feedId && (
                <button type="button" className="btn btn-ghost" onClick={() => openLink(ad.feedId)}>
                  {t('frister.link')}
                </button>
              )}
              {ad.hidden ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleAngreSkjul(ad.feedId)}
                >
                  {t('frister.undoHide')}
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
                  {t('frister.hide')}
                </button>
              )}
            </div>
            {linking === ad.feedId && tracked !== null && (
              <div className="frist-link cluster cluster-sm">
                <div className="field">
                  <label className="label" htmlFor={`frist-link-${ad.feedId}`}>
                    {t('frister.linkLabel')}
                  </label>
                  <select
                    id={`frist-link-${ad.feedId}`}
                    className="select"
                    value={linkTarget}
                    onChange={(event) => setLinkTarget(event.target.value)}
                  >
                    <option value="">{t('frister.linkPlaceholder')}</option>
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
                  {t('frister.linkConfirm')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeLink}>
                  {t('common.cancel')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
