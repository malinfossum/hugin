import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { useAnnounce } from '../../components/LiveRegion'
import type { AdDto, PipelineStatusSlug } from '../../types'

const PIPELINE_LABELS: Record<PipelineStatusSlug, string> = {
  funnet: 'Funnet',
  'soekt-selv': 'Søkt selv',
  'bedt-get': 'Bedt GET sjekke',
  svar: 'Svar',
}

function urgencyClass(daysLeft: number | null): string | undefined {
  if (daysLeft === null) return undefined
  if (daysLeft <= 3) return 'frist-rod'
  if (daysLeft <= 7) return 'frist-gul'
  return undefined
}

function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return 'ingen frist'
  if (daysLeft === 0) return 'i dag'
  return `${daysLeft} dager`
}

function formatExpires(expires: string | null): string | null {
  return expires ? new Date(expires).toLocaleDateString('nb-NO') : null
}

export function FristerList({ refreshKey }: { refreshKey: number }) {
  const [ads, setAds] = useState<AdDto[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const announce = useAnnounce()
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
      .catch(() => setError('Kunne ikke laste frister.'))
  }, [showHidden])

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
      setError('Kunne ikke skjule annonsen.')
      return
    }
    pendingFocus.current = nextFeedId
    await load()
    announce('Annonsen er skjult.')
  }

  const handleAngreSkjul = async (feedId: string) => {
    try {
      await api.del(`/api/ads/${feedId}/hide`)
    } catch {
      setError('Kunne ikke gjenopprette annonsen.')
      return
    }
    await load()
    announce('Annonsen vises igjen.')
  }

  return (
    <section aria-labelledby="frister-heading" className="frister-list">
      <h2 id="frister-heading" ref={headingRef} tabIndex={-1}>
        Frister
      </h2>
      <label>
        <input
          type="checkbox"
          checked={showHidden}
          onChange={(event) => setShowHidden(event.target.checked)}
        />
        Vis skjulte
      </label>
      {error && (
        <p role="status">
          {error}{' '}
          <button type="button" onClick={load}>
            Prøv igjen
          </button>
        </p>
      )}
      <ul>
        {ads.map((ad) => (
          <li key={ad.feedId} className="frist-row">
            {ad.sourceUrl ? (
              <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                {ad.title}
              </a>
            ) : (
              <span>{ad.title}</span>
            )}
            <span>{ad.employer}</span>
            <span>{formatExpires(ad.expires)}</span>
            <span className={urgencyClass(ad.daysLeft)}>{daysLeftText(ad.daysLeft)}</span>
            <span>{ad.category}</span>
            {ad.pipelineStatus && (
              <span className="pipeline-badge">{PIPELINE_LABELS[ad.pipelineStatus]}</span>
            )}
            {ad.hidden ? (
              <button type="button" onClick={() => handleAngreSkjul(ad.feedId)}>
                Angre skjul
              </button>
            ) : (
              <button
                type="button"
                ref={(el) => {
                  if (el) skjulRefs.current.set(ad.feedId, el)
                  else skjulRefs.current.delete(ad.feedId)
                }}
                onClick={() => handleSkjul(ad.feedId)}
              >
                Skjul
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
