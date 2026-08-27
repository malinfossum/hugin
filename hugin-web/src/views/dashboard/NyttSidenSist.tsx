import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { displayCompanyName } from '../../companyName'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAnnounce } from '../../components/LiveRegion'
import { useT } from '../../i18n'
import type { CompanyDto, NewDto } from '../../types'

/** Groups companies by kommune, preserving first-seen order of both groups and members. */
function groupByKommune(companies: CompanyDto[]): [string, CompanyDto[]][] {
  const groups = new Map<string, CompanyDto[]>()
  for (const company of companies) {
    const key = company.kommuneNavn ?? company.kommune ?? 'ukjent'
    const group = groups.get(key)
    if (group) group.push(company)
    else groups.set(key, [company])
  }
  return [...groups.entries()]
}

export function NyttSidenSist({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<NewDto | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const announce = useAnnounce()
  const t = useT()
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
    <section aria-labelledby="nytt-heading" className="nytt-siden-sist card stack">
      <h2 id="nytt-heading" ref={headingRef} tabIndex={-1}>
        {t('newSince.heading')}
      </h2>
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
            {groupByKommune(data.companies).map(([kommune, companies]) => (
              <div key={kommune} className="stack stack-sm">
                <h4 className="text-muted">{kommune}</h4>
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
            {data.ads.length > 0 && (
              <ul className="stack stack-sm">
                {data.ads.map((ad) => (
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
            )}
          </div>

          {hasNew ? (
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
