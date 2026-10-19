import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '../../components/ui/button'
import { useReturnFocus } from '../../context/returnFocus'
import { type T, useT } from '../../i18n'
import { displayCompanyName } from '../../lib/companyName'
import { formatDate } from '../../lib/dates'
import { newQuery } from '../../lib/queries'
import type { AdDto, CompanyDto, NewDto } from '../../lib/types'

interface Place {
  name: string
  ads: AdDto[]
  /** Companies, with a branch that shares its parent's name folded into the parent. */
  companies: { company: CompanyDto; branches: number }[]
  /** Every new register entry here, branches included: what the count reports. */
  companyCount: number
}

/** Groups the new ads and companies by place (kommune name, else number, else unknown), in
 * first-seen order of places and members. Region is the hard gate, so this is the reading
 * order: where first, then what. */
function groupByPlace(data: NewDto, unknownPlace: string): Place[] {
  const places = new Map<string, Place>()
  const placeFor = (name: string | null) => {
    const key = name ?? unknownPlace
    let place = places.get(key)
    if (!place) {
      place = { name: key, ads: [], companies: [], companyCount: 0 }
      places.set(key, place)
    }
    return place
  }
  for (const ad of data.ads) placeFor(ad.kommuneNavn ?? ad.kommune).ads.push(ad)
  for (const company of data.companies) {
    const place = placeFor(company.kommuneNavn ?? company.kommune)
    place.companyCount++
    const parent = company.isBranch
      ? place.companies.find(
          (entry) => !entry.company.isBranch && entry.company.name === company.name
        )
      : undefined
    if (parent) parent.branches++
    else place.companies.push({ company, branches: 0 })
  }
  return [...places.values()]
}

/** «Hamar 3» on screen, «Hamar, 1 annonse og 2 bedrifter» for a screen reader: the visible
 * count is aria-hidden so the numbers are read once, with their nouns. */
function spokenCount(place: Place, t: T): string {
  const ads =
    place.ads.length === 0
      ? null
      : place.ads.length === 1
        ? t('newSince.placeAdsOne')
        : t('newSince.placeAds', { n: place.ads.length })
  const companies =
    place.companyCount === 0
      ? null
      : place.companyCount === 1
        ? t('newSince.placeCompaniesOne')
        : t('newSince.placeCompanies', { n: place.companyCount })
  if (ads && companies) return t('newSince.placeAdsAndCompanies', { ads, companies })
  return ads ?? companies ?? ''
}

export function NewSinceLastVisit() {
  const t = useT()
  const { data: fetched, isError, isFetching, isSuccess: loaded, refetch } = useQuery(newQuery())
  // null from the query means the server has not synced yet.
  const data = fetched ?? undefined
  const error = isError ? t('newSince.loadError') : null
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const { remember, restore } = useReturnFocus()

  const hasNew = !!data && (data.companies.length > 0 || data.ads.length > 0)

  // Back from a company opened here remounts this section and refetches its list. Once the fresh
  // list has rendered, focus goes back to the link that opened the company, or to this section's
  // heading when the company is no longer new (spec v3.8 B5). Waiting for the refetch keeps a
  // link the fresh data removes from being focused for a moment and then lost. A failed refetch
  // also restores (to the heading), so focus never stays on <body>.
  useEffect(() => {
    if (!isFetching && (data || isError)) restore(sectionRef.current, headingRef.current)
  }, [data, isError, isFetching, restore])

  return (
    <section
      ref={sectionRef}
      aria-labelledby="new-since-heading"
      className="flex flex-col gap-4 pt-10 font-sans md:flex-row md:gap-0"
    >
      <div className="flex flex-col gap-1 md:w-90 md:shrink-0 md:pe-8">
        <h2
          id="new-since-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-xl font-semibold"
        >
          {t('newSince.heading')}
        </h2>
        <p className="text-body-sm text-pretty text-muted-foreground">
          {t('newSince.description')}
        </p>
      </div>
      <div className="flex-1">
        {error && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm"
          >
            <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
            {error}
            <Button variant="link" className="min-h-11" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          </p>
        )}
        {!error && loaded && data === undefined && (
          <p className="text-body-sm text-muted-foreground">{t('newSince.noSyncYet')}</p>
        )}
        {!error && loaded && data && !hasNew && (
          <p className="text-body-sm text-muted-foreground">{t('newSince.none')}</p>
        )}
        {!error && loaded && data && hasNew && (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
            {groupByPlace(data, t('newSince.unknownPlace')).map((place) => (
              <div key={place.name}>
                {/* Map lettering (DESIGN.md): the kommune name in tracked contour capitals. */}
                <h3 className="flex items-baseline justify-between border-b border-border pb-1.5 text-xs font-semibold tracking-widest text-contour uppercase">
                  {place.name}
                  <span
                    aria-hidden="true"
                    className="text-sm font-medium tracking-normal text-muted-foreground normal-case tabular-nums"
                  >
                    {' '}
                    {place.ads.length + place.companyCount}
                  </span>
                  <span className="sr-only">, {spokenCount(place, t)}</span>
                </h3>
                <ul className="mt-2.5 flex list-none flex-col gap-2.5 ps-0">
                  {place.ads.map((ad) => (
                    <li key={ad.feedId} className="flex flex-col">
                      {ad.sourceUrl ? (
                        <a
                          href={ad.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground no-underline hover:underline"
                        >
                          {ad.title}
                        </a>
                      ) : (
                        <span className="font-medium">{ad.title}</span>
                      )}
                      <small className="text-small text-muted-foreground">
                        <span className="font-semibold text-forest">{t('newSince.adTag')}</span>
                        {ad.employer && ` · ${displayCompanyName(ad.employer)}`}
                        {ad.expires &&
                          ` · ${t('newSince.deadline', { date: formatDate(ad.expires) })}`}
                      </small>
                    </li>
                  ))}
                  {place.companies.map(({ company, branches }) => (
                    <li key={company.orgnr} className="flex flex-col">
                      <span className="font-medium">
                        {/* Opens the company's detail (spec v3.8 B5). data-return-focus lets the
                        section focus this link again when Back returns here. */}
                        <Link
                          to="/companies/{-$orgnr}"
                          params={{ orgnr: company.orgnr }}
                          search={{}}
                          data-return-focus={`company:${company.orgnr}`}
                          onClick={() =>
                            remember(`company:${company.orgnr}`, `/companies/${company.orgnr}`)
                          }
                          className="text-foreground underline decoration-input underline-offset-3 hover:decoration-current"
                        >
                          {displayCompanyName(company.name)}
                        </Link>
                        {branches > 0 && (
                          <span className="text-small font-normal whitespace-nowrap text-muted-foreground">
                            {' '}
                            {branches === 1
                              ? t('newSince.withBranch')
                              : t('newSince.withBranches', { n: branches })}
                          </span>
                        )}
                      </span>
                      {company.isBranch && (
                        <small className="text-small text-muted-foreground">
                          {t('newSince.branch')}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
