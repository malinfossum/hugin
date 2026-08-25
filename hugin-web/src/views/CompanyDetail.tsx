import type { ReactNode } from 'react'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { displayCompanyName } from '../companyName'
import { CompanyLink } from '../components/CompanyLink'
import { formatDate } from '../dates'
import { type T, useT } from '../i18n'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../types'

function publishedText(published: string | null, t: T): string | null {
  return published ? t('companies.published', { date: formatDate(published) }) : null
}

interface UnitTab {
  orgnr: string
  label: string
}

/** Branch tab labels prefer the kommune name — it's the whole point of a branch tab (which
 * office is this?). Falls back to the display name when a branch has none, or when its
 * kommuneNavn collides with another branch's (kommune name alone wouldn't disambiguate them). */
function branchTabLabel(branch: CompanyDto, branches: CompanyDto[]): string {
  if (!branch.kommuneNavn) return displayCompanyName(branch.name)
  const sharedByCount = branches.filter((b) => b.kommuneNavn === branch.kommuneNavn).length
  return sharedByCount > 1 ? displayCompanyName(branch.name) : branch.kommuneNavn
}

function AdHistory({ ads, t }: { ads: AdDto[]; t: T }) {
  if (ads.length === 0) return <p className="empty-hint">{t('companies.noAds')}</p>

  return (
    <ul className="stack stack-sm">
      {ads.map((ad) => (
        <li key={ad.feedId} className="panel stack stack-sm">
          <span className="text-strong">{ad.title}</span>
          {!ad.isActive && <span className="badge">{t('companies.expiredTag')}</span>}
          {publishedText(ad.published, t) && (
            <span className="text-muted">{publishedText(ad.published, t)}</span>
          )}
          <span className="help">
            {t('companies.deadlineLabel', { date: ad.expires ? formatDate(ad.expires) : '—' })}
          </span>
          {ad.sourceUrl && (
            <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
              {t('companies.seeAdAtNav')}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

function UnitBody({ detail, t }: { detail: CompanyDetailDto; t: T }) {
  return (
    <>
      <h2>
        {displayCompanyName(detail.company.name)}
        {detail.company.isBranch && ` ${t('common.branchTag')}`}
      </h2>
      <dl className="company-detail-dl">
        <dt>{t('companies.orgnr')}</dt>
        <dd>{detail.company.orgnr}</dd>
        <dt>{t('companies.kommune')}</dt>
        <dd>{detail.company.kommuneNavn ?? detail.company.kommune ?? '—'}</dd>
        <dt>{t('companies.nace')}</dt>
        <dd>{detail.company.naceCode ?? '—'}</dd>
        {detail.company.isBranch && detail.company.parentOrgnr && (
          <>
            <dt>{t('companies.parentCompany')}</dt>
            <dd>{detail.company.parentOrgnr}</dd>
          </>
        )}
        <dt>{t('companies.websiteRow')}</dt>
        <dd>
          <CompanyLink
            name={displayCompanyName(detail.company.name)}
            kommuneNavn={detail.company.kommuneNavn}
            website={detail.company.website}
          />
        </dd>
      </dl>

      <h3>{t('companies.adHistory')}</h3>
      <AdHistory ads={detail.ads} t={t} />
    </>
  )
}

/** Only rendered when tabs exist — a `role="tabpanel"` isn't valid ARIA without a tablist to go
 * with it, so the no-tabs case (a lone branch's own detail) renders the same content directly
 * instead of wrapping it. */
function TabPanel({ selectedOrgnr, children }: { selectedOrgnr: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="unit-tabpanel"
      aria-labelledby={`unit-tab-${selectedOrgnr}`}
      className="stack"
    >
      {children}
    </div>
  )
}

export function CompanyDetail({ orgnr, onClose }: { orgnr: string; onClose: () => void }) {
  const [selectedOrgnr, setSelectedOrgnr] = useState(orgnr)
  const [rootDetail, setRootDetail] = useState<CompanyDetailDto | null>(null)
  const [detail, setDetail] = useState<CompanyDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, CompanyDetailDto>())
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const t = useT()

  // Lazy per-unit fetch with a cache: a unit already visited (root or any branch tab) is never
  // refetched. The cache only ever holds successful responses, so a failed fetch is retried
  // for real rather than replaying a stale error.
  const loadUnit = useCallback(
    (unitOrgnr: string) => {
      setError(null)
      setDetail(null)
      const cached = cacheRef.current.get(unitOrgnr)
      const request = cached
        ? Promise.resolve(cached)
        : api.get<CompanyDetailDto>(`/api/companies/${unitOrgnr}`).then((d) => {
            cacheRef.current.set(unitOrgnr, d)
            return d
          })
      return request
        .then((d) => {
          setDetail(d)
          if (unitOrgnr === orgnr) setRootDetail(d)
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : t('companies.detailLoadError'))
        )
    },
    [orgnr, t]
  )

  // A new root company was opened (not a tab switch) — reset to it from scratch.
  useEffect(() => {
    cacheRef.current = new Map()
    setSelectedOrgnr(orgnr)
    setRootDetail(null)
    loadUnit(orgnr)
  }, [orgnr, loadUnit])

  const selectUnit = (unitOrgnr: string) => {
    setSelectedOrgnr(unitOrgnr)
    loadUnit(unitOrgnr)
  }

  const branches = rootDetail?.branches ?? []
  const tabs: UnitTab[] =
    branches.length > 0
      ? [
          { orgnr, label: t('companies.mainUnit') },
          ...branches.map((b) => ({ orgnr: b.orgnr, label: branchTabLabel(b, branches) })),
        ]
      : []

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    selectUnit(next.orgnr)
    tabRefs.current.get(next.orgnr)?.focus()
  }

  return (
    <div className="company-detail card stack">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        {t('common.back')}
      </button>

      {tabs.length > 0 && (
        // Design-system tabs component (`.tab-list`/`.tab`) for the accent-underline styling;
        // `cluster cluster-sm` layered on for its flex-wrap — the strip wraps rather than
        // scrolling when it doesn't fit a narrow (375px) screen.
        <div
          role="tablist"
          aria-label={t('companies.unitTabs')}
          className="tab-list cluster cluster-sm"
        >
          {tabs.map((tab, index) => {
            const selected = tab.orgnr === selectedOrgnr
            return (
              <button
                key={tab.orgnr}
                type="button"
                role="tab"
                id={`unit-tab-${tab.orgnr}`}
                aria-selected={selected}
                aria-controls="unit-tabpanel"
                tabIndex={selected ? 0 : -1}
                className="tab"
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.orgnr, el)
                  else tabRefs.current.delete(tab.orgnr)
                }}
                onClick={() => selectUnit(tab.orgnr)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={() => loadUnit(selectedOrgnr)}>
            {t('common.retry')}
          </button>
        </p>
      )}

      {!error &&
        detail &&
        (tabs.length > 0 ? (
          <TabPanel selectedOrgnr={selectedOrgnr}>
            <UnitBody detail={detail} t={t} />
          </TabPanel>
        ) : (
          <div className="stack">
            <UnitBody detail={detail} t={t} />
          </div>
        ))}
    </div>
  )
}
