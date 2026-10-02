import { useCallback, useEffect, useState } from 'react'
import { adMatchesFocus, useFocus } from '../../context/focus'
import { type T, useT } from '../../i18n'
import { api } from '../../lib/api'
import type { AdDto } from '../../lib/types'

function deadlineText(daysLeft: number, t: T): string {
  if (daysLeft < 0) return t('needsAction.deadlineExpired')
  if (daysLeft === 0) return t('needsAction.deadlineToday')
  if (daysLeft === 1) return t('needsAction.deadlineInOneDay')
  return t('needsAction.deadlineInDays', { n: daysLeft })
}

export function NeedsAction({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const { focus } = useFocus()
  const t = useT()

  const load = useCallback(() => {
    setLoadError(null)
    return api
      .get<AdDto[]>('/api/ads')
      .then(setAds)
      .catch(() => setLoadError(t('needsAction.loadError')))
  }, [t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshKey])

  const needsAction = ads.filter(
    (ad) =>
      adMatchesFocus(ad, focus) &&
      ad.pipelineStatus === 'active' &&
      ad.daysLeft !== null &&
      ad.daysLeft <= 7
  )

  if (!loadError && needsAction.length === 0) return null

  return (
    <section aria-labelledby="needs-action-heading" className="needs-action alert alert-warning">
      <h2 id="needs-action-heading">{t('needsAction.heading')}</h2>
      <p className="text-muted">{t('needsAction.description')}</p>
      {loadError && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {loadError}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}
      <ul>
        {needsAction.map((ad) => (
          <li key={ad.feedId}>
            {t('needsAction.item', {
              title: ad.title,
              status: t('needsAction.notApplied'),
              deadline: deadlineText(ad.daysLeft as number, t),
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}
