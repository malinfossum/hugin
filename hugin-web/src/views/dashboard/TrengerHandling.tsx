import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdDto } from '../../types'

function fristText(daysLeft: number): string {
  if (daysLeft < 0) return 'frist utløpt'
  if (daysLeft === 0) return 'frist i dag'
  return `frist om ${daysLeft} dager`
}

export function TrengerHandling({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])

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
      <h2 id="trenger-heading">Trenger handling</h2>
      <ul>
        {trenger.map((ad) => (
          <li key={ad.feedId}>
            {ad.title} — funnet, ikke søkt — {fristText(ad.daysLeft as number)}
          </li>
        ))}
      </ul>
    </section>
  )
}
