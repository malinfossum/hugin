import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { adMatchesFocus, useFocus } from '../../focus'
import { type T, useT } from '../../i18n'
import type { AdDto } from '../../types'

function fristText(daysLeft: number, t: T): string {
  if (daysLeft < 0) return t('trenger.deadlineExpired')
  if (daysLeft === 0) return t('trenger.deadlineToday')
  if (daysLeft === 1) return t('trenger.deadlineInOneDay')
  return t('trenger.deadlineInDays', { n: daysLeft })
}

export function TrengerHandling({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const { focus } = useFocus()
  const t = useT()

  const load = useCallback(() => {
    setLoadError(null)
    return api
      .get<AdDto[]>('/api/ads')
      .then(setAds)
      .catch(() => setLoadError(t('trenger.loadError')))
  }, [t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshKey])

  const trenger = ads.filter(
    (ad) =>
      adMatchesFocus(ad, focus) &&
      ad.pipelineStatus === 'active' &&
      ad.daysLeft !== null &&
      ad.daysLeft <= 7
  )

  if (!loadError && trenger.length === 0) return null

  return (
    <section aria-labelledby="trenger-heading" className="trenger-handling alert alert-warning">
      <h2 id="trenger-heading">{t('trenger.heading')}</h2>
      {loadError && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {loadError}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}
      <ul>
        {trenger.map((ad) => (
          <li key={ad.feedId}>
            {t('trenger.item', {
              title: ad.title,
              status: t('trenger.notApplied'),
              deadline: fristText(ad.daysLeft as number, t),
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}
