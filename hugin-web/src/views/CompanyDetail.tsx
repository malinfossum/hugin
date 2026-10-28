import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import { CompanyLink } from '../components/CompanyLink'
import { Button } from '../components/ui/button'
import { type T, useT } from '../i18n'
import { ApiError } from '../lib/api'
import { displayCompanyName } from '../lib/companyName'
import { formatDate } from '../lib/dates'
import { companyQuery } from '../lib/queries'
import type { AdDto, CompanyDetailDto, CompanyDto } from '../lib/types'

function publishedText(published: string | null, t: T): string | null {
  return published ? t('companies.published', { date: formatDate(published) }) : null
}

interface UnitTab {
  orgnr: string
  label: string
}

/** Branch tab labels prefer the kommune name. It's the whole point of a branch tab (which
 * office is this?). Falls back to the display name when a branch has none, or when its
 * kommuneNavn collides with another branch's (kommune name alone wouldn't disambiguate them). */
function branchTabLabel(branch: CompanyDto, branches: CompanyDto[]): string {
  if (!branch.kommuneNavn) return displayCompanyName(branch.name)
  const sharedByCount = branches.filter((b) => b.kommuneNavn === branch.kommuneNavn).length
  return sharedByCount > 1 ? displayCompanyName(branch.name) : branch.kommuneNavn
}

/** The ad history as sheet rows: title, then a subline of its state and dates. An expired ad's
 * title drops to ink-secondary, so it never reads as active (PRODUCT.md: truth over completeness). */
function AdHistory({ ads, t }: { ads: AdDto[]; t: T }) {
  if (ads.length === 0)
    return <p className="text-body-sm text-muted-foreground">{t('companies.noAds')}</p>

  return (
    <ul className="flex list-none flex-col border-b border-border ps-0">
      {ads.map((ad) => (
        <li
          key={ad.feedId}
          className="flex flex-col gap-x-6 gap-y-0.5 border-t border-border py-3 md:flex-row md:items-center"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cn(
                'font-medium',
                ad.isActive ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {ad.title}
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
              {!ad.isActive && <span className="font-semibold">{t('companies.expiredTag')}</span>}
              {publishedText(ad.published, t) && <span>{publishedText(ad.published, t)}</span>}
              <span>
                {t('companies.deadlineLabel', {
                  date: ad.expires ? formatDate(ad.expires) : t('companies.notGiven'),
                })}
              </span>
            </span>
          </div>
          {ad.sourceUrl && (
            <a
              href={ad.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-foreground underline decoration-input underline-offset-3 hover:decoration-current md:self-center"
            >
              {t('companies.seeAdAtNav')}
              <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The unit's register facts as one wrapping line of label-over-value pairs between hairlines. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

function UnitBody({
  detail,
  t,
  headingRef,
}: {
  detail: CompanyDetailDto
  t: T
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-semibold text-balance text-foreground md:text-headline"
      >
        {displayCompanyName(detail.company.name)}
        {detail.company.isBranch && ` ${t('common.branchTag')}`}
      </h2>
      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-y border-border py-4">
        <Fact label={t('companies.orgnr')}>{detail.company.orgnr}</Fact>
        <Fact label={t('companies.kommune')}>
          {detail.company.kommuneNavn ?? detail.company.kommune ?? t('companies.notGiven')}
        </Fact>
        <Fact label={t('companies.nace')}>
          {detail.company.naceCode ?? t('companies.notGiven')}
        </Fact>
        {detail.company.isBranch && detail.company.parentOrgnr && (
          <Fact label={t('companies.parentCompany')}>{detail.company.parentOrgnr}</Fact>
        )}
        <Fact label={t('companies.websiteRow')}>
          <CompanyLink
            name={displayCompanyName(detail.company.name)}
            kommuneNavn={detail.company.kommuneNavn}
            website={detail.company.website}
          />
        </Fact>
      </dl>

      <h3 className="mt-10 mb-3 font-heading text-xl font-semibold text-foreground">
        {t('companies.adHistory')}
      </h3>
      <AdHistory ads={detail.ads} t={t} />
    </>
  )
}

/** Only rendered when tabs exist. A `role="tabpanel"` isn't valid ARIA without a tablist to go
 * with it, so the no-tabs case (a lone branch's own detail) renders the same content directly
 * instead of wrapping it. */
function TabPanel({ selectedOrgnr, children }: { selectedOrgnr: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id="unit-tabpanel"
      aria-labelledby={`unit-tab-${selectedOrgnr}`}
      className="flex flex-col"
    >
      {children}
    </div>
  )
}

export function CompanyDetail({ orgnr, onClose }: { orgnr: string; onClose: () => void }) {
  // The tab selection is remembered together with the root it belongs to, so opening a different
  // company falls back to that company's own unit without an effect (and without one render
  // fetching the previous company's tab). The selection is also reset during render when the
  // root changes, so A → C → back to A (while mounted) lands on A's own unit, not its old tab.
  const t = useT()
  const [selection, setSelection] = useState({ root: orgnr, unit: orgnr })
  if (selection.root !== orgnr) setSelection({ root: orgnr, unit: orgnr })
  const selectedOrgnr = selection.root === orgnr ? selection.unit : orgnr
  // Both queries share a cache key while the main unit is selected, so that is one request.
  const rootQuery = useQuery(companyQuery(orgnr))
  const unitQuery = useQuery(companyQuery(selectedOrgnr))
  const rootDetail = rootQuery.data ?? null
  const detail = unitQuery.data ?? null
  const error = unitQuery.isError
    ? unitQuery.error instanceof ApiError
      ? unitQuery.error.message
      : t('companies.detailLoadError')
    : null
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusedFor = useRef<string | null>(null)
  // Opening a company replaces the page under the focused row or link, so focus would fall to
  // <body>. Move it to the company heading once per opened company, when its data has rendered.
  // Switching branch tabs keeps focus on the tab, so this runs only when `orgnr` changes. The
  // router restores the page's scroll position; focusing must not move it.
  useEffect(() => {
    if (!detail || error || focusedFor.current === orgnr) return
    // An error hides the body, so the heading is missing; keep the one-shot for a successful
    // retry (`error` is a dependency so the retry runs this again).
    if (!headingRef.current) return
    focusedFor.current = orgnr
    headingRef.current.focus({ preventScroll: true })
  }, [orgnr, detail, error])

  const selectUnit = (unitOrgnr: string) => setSelection({ root: orgnr, unit: unitOrgnr })

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
    <div className="flex flex-col pt-4 font-sans md:pt-8">
      <Button variant="link" className="-ms-2.5 min-h-11 self-start" onClick={onClose}>
        <ArrowLeft aria-hidden="true" />
        {t('common.back')}
      </Button>

      {tabs.length > 0 && (
        // The units as underline tabs on a hairline; the strip wraps on a narrow screen.
        <div
          role="tablist"
          aria-label={t('companies.unitTabs')}
          className="mt-4 mb-6 flex flex-wrap gap-x-1 border-b border-border"
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
                className={cn(
                  '-mb-px min-h-11 rounded-t-lg border-0 border-b-2 bg-transparent px-3 text-body-sm hover:bg-muted hover:text-foreground',
                  selected
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground'
                )}
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
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {error}
          <Button variant="link" className="min-h-11" onClick={() => unitQuery.refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}

      {!error &&
        detail &&
        (tabs.length > 0 ? (
          <TabPanel selectedOrgnr={selectedOrgnr}>
            <UnitBody detail={detail} t={t} headingRef={headingRef} />
          </TabPanel>
        ) : (
          <div className="mt-4 flex flex-col">
            <UnitBody detail={detail} t={t} headingRef={headingRef} />
          </div>
        ))}
    </div>
  )
}
