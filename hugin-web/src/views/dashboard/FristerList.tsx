import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useAnnounce } from '../../components/LiveRegion'
import { localeFor, type T, useLang, useT } from '../../i18n'
import { pipelineLabel } from '../../pipelineLabels'
import type { AdDto } from '../../types'

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
  return t('frister.daysBadge', { n: daysLeft })
}

function formatExpires(expires: string | null, locale: string): string | null {
  return expires ? new Date(expires).toLocaleDateString(locale) : null
}

export function FristerList({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const announce = useAnnounce()
  const t = useT()
  const [lang] = useLang()
  const locale = localeFor(lang)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const skjulRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // undefined: no pending focus move. null: focus the heading. string: focus that row's Skjul button.
  const pendingFocus = useRef<string | null | undefined>(undefined)

  const load = useCallback(() => {
    setError(null)
    const path = showHidden ? '/api/ads?hidden=true' : '/api/ads'
    return api
      .get<AdDto[]>(path)
      .then(setAds)
      .catch(() => setError(t('frister.loadError')))
  }, [showHidden, t])

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

  const handleSkjul = async (feedId: string) => {
    const index = ads.findIndex((a) => a.feedId === feedId)
    const nextFeedId = ads[index + 1]?.feedId ?? null
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

  return (
    <section aria-labelledby="frister-heading" className="frister-list card stack">
      <h2 id="frister-heading" ref={headingRef} tabIndex={-1}>
        {t('frister.heading')}
      </h2>
      <label className="cluster cluster-sm">
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
        />
        {t('frister.showHidden')}
      </label>
      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}
      <ul className="stack stack-sm">
        {ads.map((ad) => (
          <li key={ad.feedId} className="frist-row">
            <div className="frist-row-title stack stack-sm">
              {ad.sourceUrl ? (
                <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {ad.title}
                </a>
              ) : (
                <span>{ad.title}</span>
              )}
              <span className="text-muted">{ad.employer}</span>
            </div>
            <div className="frist-row-date cluster cluster-sm">
              <span className="text-muted">{formatExpires(ad.expires, locale)}</span>
              <span className={daysLeftBadgeClass(ad.daysLeft)}>
                {daysLeftText(ad.daysLeft, t)}
              </span>
            </div>
            <span className="text-muted">{ad.category}</span>
            <div className="frist-row-actions cluster cluster-sm">
              {ad.pipelineStatus && (
                <span className="badge badge-accent">{pipelineLabel(t, ad.pipelineStatus)}</span>
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
          </li>
        ))}
      </ul>
    </section>
  )
}
