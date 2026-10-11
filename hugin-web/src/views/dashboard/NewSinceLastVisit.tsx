import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAnnounce } from '../../components/LiveRegion'
import { useReadOnly } from '../../context/readOnly'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { displayCompanyName } from '../../lib/companyName'
import type { CompanyDto, NewDto } from '../../lib/types'

/** Groups items by place, preserving first-seen order of both groups and members. */
function groupByPlace<T>(
  items: T[],
  placeOf: (item: T) => string | null,
  unknownPlace: string
): [string, T[]][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = placeOf(item) ?? unknownPlace
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return [...groups.entries()]
}

/** «Hamar · 3» on screen, «Hamar, 3 bedrifter» for a screen reader: the visible count is
 * aria-hidden so the number is read once, with its noun. */
function PlaceHeading({
  place,
  count,
  spokenCount,
}: {
  place: string
  count: number
  spokenCount: string
}) {
  return (
    <h4 className="text-muted">
      {place}
      <span aria-hidden="true"> · {count}</span>
      <span className="visually-hidden">, {spokenCount}</span>
    </h4>
  )
}

export function NewSinceLastVisit({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<NewDto | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const announce = useAnnounce()
  const t = useT()
  const { readOnly } = useReadOnly()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef(false)
  // Snapshot of the asOf the user was actually looking at when they opened the dialog.
  // A refetch (refreshKey bump) while the dialog is open must not change what gets posted —
  // that would mark items the user never reviewed as seen.
  const reviewedAsOf = useRef<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    return api
      .get<NewDto | undefined>('/api/new')
      .then((result) => {
        setData(result)
        setLoaded(true)
      })
      .catch(() => setError(t('newSince.loadError')))
  }, [t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshKey])

  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the refetch-completed signal that applies the pending focus move
  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    headingRef.current?.focus()
  }, [data])

  const handleConfirm = async () => {
    const asOf = reviewedAsOf.current
    if (!asOf) return
    setConfirmOpen(false)
    try {
      await api.post('/api/seen', { asOf })
    } catch {
      setError(t('newSince.markError'))
      return
    }
    reviewedAsOf.current = null
    pendingFocus.current = true
    await load()
    announce(t('newSince.markedAnnounce'))
  }

  const handleCancel = () => {
    reviewedAsOf.current = null
    setConfirmOpen(false)
  }

  const hasNew = !!data && (data.companies.length > 0 || data.ads.length > 0)

  return (
    <section aria-labelledby="new-since-heading" className="new-since-last-visit card stack">
      <h2 id="new-since-heading" ref={headingRef} tabIndex={-1}>
        {t('newSince.heading')}
      </h2>
      <p className="text-muted">{t('newSince.description')}</p>
      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}
      {!error && loaded && data === undefined && (
        <p className="empty-hint">{t('newSince.noSyncYet')}</p>
      )}
      {!error && loaded && data && (
        <div className="stack">
          <div className="panel stack stack-sm">
            <h3>{t('newSince.newCompanies', { n: data.companies.length })}</h3>
            {groupByPlace(
              data.companies,
              (company: CompanyDto) => company.kommuneNavn ?? company.kommune,
              t('newSince.unknownPlace')
            ).map(([place, companies]) => (
              <div key={place} className="stack stack-sm">
                <PlaceHeading
                  place={place}
                  count={companies.length}
                  spokenCount={
                    companies.length === 1
                      ? t('newSince.placeCompaniesOne')
                      : t('newSince.placeCompanies', { n: companies.length })
                  }
                />
                <ul className="stack stack-sm">
                  {companies.map((company) => (
                    <li key={company.orgnr}>
                      {displayCompanyName(company.name)}
                      {company.isBranch ? ` ${t('common.branchTag')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="panel stack stack-sm">
            <h3>{t('newSince.newAds', { n: data.ads.length })}</h3>
            {groupByPlace(
              data.ads,
              (ad) => ad.kommuneNavn ?? ad.kommune,
              t('newSince.unknownPlace')
            ).map(([place, ads]) => (
              <div key={place} className="stack stack-sm">
                <PlaceHeading
                  place={place}
                  count={ads.length}
                  spokenCount={
                    ads.length === 1
                      ? t('newSince.placeAdsOne')
                      : t('newSince.placeAds', { n: ads.length })
                  }
                />
                <ul className="stack stack-sm">
                  {ads.map((ad) => (
                    <li key={ad.feedId}>
                      {ad.sourceUrl ? (
                        <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {ad.title}
                        </a>
                      ) : (
                        <span>{ad.title}</span>
                      )}{' '}
                      — {ad.employer ? displayCompanyName(ad.employer) : ad.employer}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {hasNew ? (
            !readOnly && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  reviewedAsOf.current = data.asOf
                  setConfirmOpen(true)
                }}
              >
                {t('newSince.markSeen')}
              </button>
            )
          ) : (
            <p className="empty-hint">{t('newSince.none')}</p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title={t('newSince.confirmTitle')}
        confirmLabel={t('newSince.markSeen')}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </section>
  )
}
