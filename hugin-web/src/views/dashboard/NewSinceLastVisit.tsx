import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../components/ui/accordion'
import { Button } from '../../components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { useReturnFocus } from '../../context/returnFocus'
import { type T, useT } from '../../i18n'
import { displayCompanyName } from '../../lib/companyName'
import { formatDate } from '../../lib/dates'
import { newQuery } from '../../lib/queries'
import type { AdDto, CompanyDto, NewDto } from '../../lib/types'

interface Place {
  name: string
  ads: AdDto[]
  /** Companies, with a branch folded into its parent (parentOrgnr) when it shares the parent's
   * name and place. */
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
    place.companies.push({ company, branches: 0 })
  }
  // Folded after grouping: the server orders by name, so a branch can come before its parent.
  for (const place of places.values()) {
    const parents = new Map(
      place.companies
        .filter((entry) => !entry.company.isBranch)
        .map((entry) => [entry.company.orgnr, entry])
    )
    place.companies = place.companies.filter(({ company }) => {
      const parent = company.parentOrgnr ? parents.get(company.parentOrgnr) : undefined
      if (!company.isBranch || parent?.company.name !== company.name) return true
      parent.branches++
      return false
    })
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

/** A new ad as a small card on a fixed rhythm: the title, the employer, then whether it is
 * still open and its deadline, each on one line (a long title or name ends in an ellipsis and
 * reads in full from the tooltip). With a link the whole card is the link. A closed ad has
 * none, since NAV strips a closed ad's content, link included; it reads as closed like it does
 * in a company's ad history (AdHistory), never as an open «Ny annonse». */
function AdCard({ ad }: { ad: AdDto }) {
  const t = useT()
  const employer = ad.employer && displayCompanyName(ad.employer)
  return (
    <li className="group/ad relative flex">
      <Card size="sm" className="flex-1">
        <CardHeader>
          <CardTitle>
            <span
              title={ad.title}
              className={cn(
                'line-clamp-1 group-hover/ad:has-[a]:underline',
                ad.isActive ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {ad.sourceUrl ? (
                <a
                  href={ad.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  // Stretched over the card (the li is its containing block), so the whole card
                  // is the target, and its focus ring goes round the card instead of the text.
                  className="text-inherit no-underline outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-lake"
                >
                  {ad.title}
                </a>
              ) : (
                ad.title
              )}
            </span>
          </CardTitle>
          {employer && (
            <CardDescription>
              <span title={employer} className="line-clamp-1">
                {employer}
              </span>
            </CardDescription>
          )}
          <p className="text-small text-muted-foreground tabular-nums">
            {ad.isActive ? (
              <span className="font-medium text-forest">{t('newSince.adTag')}</span>
            ) : (
              <span className="font-medium">{t('companies.expiredTag')}</span>
            )}
            {ad.expires && ` · ${t('newSince.deadline', { date: formatDate(ad.expires) })}`}
          </p>
        </CardHeader>
      </Card>
    </li>
  )
}

/** A new company on the same rhythm as an ad's card: its name (with any branch folded into
 * it), «Avdeling» when it is a branch itself, then the tag. */
function CompanyCard({ company, branches }: { company: CompanyDto; branches: number }) {
  const t = useT()
  const { remember } = useReturnFocus()
  const name = displayCompanyName(company.name)
  return (
    <li className="group/company relative flex">
      <Card size="sm" className="flex-1">
        <CardHeader>
          <CardTitle>
            <span title={name} className="line-clamp-1">
              {/* Opens the company's detail (spec v3.8 B5), stretched over the card like an ad's
              link. data-return-focus lets the section focus it again when Back returns here. */}
              <Link
                to="/companies/{-$orgnr}"
                params={{ orgnr: company.orgnr }}
                search={{}}
                data-return-focus={`company:${company.orgnr}`}
                onClick={() => remember(`company:${company.orgnr}`, `/companies/${company.orgnr}`)}
                className="text-inherit no-underline outline-none group-hover/company:underline after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-lake"
              >
                {name}
              </Link>
              {branches > 0 && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  {branches === 1
                    ? t('newSince.withBranch')
                    : t('newSince.withBranches', { n: branches })}
                </span>
              )}
            </span>
          </CardTitle>
          {company.isBranch && <CardDescription>{t('newSince.branch')}</CardDescription>}
          <p className="text-small font-medium text-forest">{t('newSince.companyTag')}</p>
        </CardHeader>
      </Card>
    </li>
  )
}

/** Where the open places live for the tab's session: a company's detail unmounts the dashboard,
 * and Back should find the place it was opened from still open. */
const OPEN_PLACES_KEY = 'hugin-new-since-open'

function readOpenPlaces(): string[] {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(OPEN_PLACES_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function NewSinceLastVisit() {
  const t = useT()
  const [openPlaces, setOpenPlaces] = useState(readOpenPlaces)
  const keepOpenPlaces = (places: string[]) => {
    setOpenPlaces(places)
    try {
      window.sessionStorage.setItem(OPEN_PLACES_KEY, JSON.stringify(places))
    } catch {
      // Storage blocked: the places still open and close, they just reset on the next visit.
    }
  }
  const { data: fetched, isError, isFetching, isSuccess: loaded, refetch } = useQuery(newQuery())
  // null from the query means the server has not synced yet.
  const data = fetched ?? undefined
  const error = isError ? t('newSince.loadError') : null
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const { restore } = useReturnFocus()

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
          <p className="text-body-sm text-ink-tertiary">{t('newSince.none')}</p>
        )}
        {!error && loaded && data && hasNew && (
          // One closed row per place: a long arrival list stays a short index until a place is
          // opened. Several can be open at once, to compare two places side by side. The open
          // ones outlast a visit to a company, so Back finds its link where it was.
          <div className="border-y border-border">
            <Accordion multiple value={openPlaces} onValueChange={keepOpenPlaces}>
              {groupByPlace(data, t('newSince.unknownPlace')).map((place) => (
                <AccordionItem key={place.name} value={place.name}>
                  <AccordionTrigger className="min-h-11 items-center">
                    {/* Map lettering (DESIGN.md): the kommune name in tracked contour capitals. */}
                    <span className="flex-1 text-xs font-semibold tracking-widest text-contour uppercase">
                      {place.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ms-3 font-medium text-muted-foreground tabular-nums"
                    >
                      {place.ads.length + place.companyCount}
                    </span>
                    <span className="sr-only">, {spokenCount(place, t)}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="mt-1 mb-2.5 grid list-none grid-cols-1 gap-3 ps-0 sm:grid-cols-2 xl:grid-cols-3">
                      {place.ads.map((ad) => (
                        <AdCard key={ad.feedId} ad={ad} />
                      ))}
                      {place.companies.map(({ company, branches }) => (
                        <CompanyCard key={company.orgnr} company={company} branches={branches} />
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </div>
    </section>
  )
}
