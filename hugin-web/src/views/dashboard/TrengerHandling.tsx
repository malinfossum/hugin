import { useEffect, useState } from 'react'
import { api } from '../../api'
import { type T, useT } from '../../i18n'
import type { AdDto } from '../../types'

function fristText(daysLeft: number, t: T): string {
  if (daysLeft < 0) return t('trenger.deadlineExpired')
  if (daysLeft === 0) return t('trenger.deadlineToday')
  return t('trenger.deadlineInDays', { n: daysLeft })
}

export function TrengerHandling({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const t = useT()

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    api
      .get<AdDto[]>('/api/ads')
      .then(setAds)
      .catch(() => {})
  }, [refreshKey])

  const trenger = ads.filter(
    (ad) => ad.pipelineStatus === 'active' && ad.daysLeft !== null && ad.daysLeft <= 7
  )

  if (trenger.length === 0) return null

  return (
    <section aria-labelledby="trenger-heading" className="trenger-handling alert alert-warning">
      <h2 id="trenger-heading">{t('trenger.heading')}</h2>
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
