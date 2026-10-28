import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RegionChips } from '../components/RegionChips'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select'
import { useFocus } from '../context/focus'
import { useFormatNumber, useT } from '../i18n'
import { displayCompanyName } from '../lib/companyName'
import {
  COMPANY_PAGE_SIZE,
  type CompanyListParams,
  companyPagesQuery,
  kommunerQuery,
} from '../lib/queries'
import type { CompanyGroupDto } from '../lib/types'
import { CompanyDetail } from './CompanyDetail'

/** The row stands for the whole group, so its count is the group total: main plus branches. */
function groupOpenAds(group: CompanyGroupDto): number {
  return group.branches.reduce((sum, branch) => sum + branch.openAds, group.main.openAds)
}

/** The list's filters, kept in the URL (`?q=&website=&ads=`) so they survive navigating away and
 * back, a reload, and a shared link. Absent means unfiltered. */
export interface CompaniesFilters {
  q?: string
  website?: 'has' | 'none'
  ads?: 'open'
}

interface CompaniesViewProps {
  filters: CompaniesFilters
  onFiltersChange: (patch: CompaniesFilters) => void
  selectedOrgnr: string | null
  onOpenCompany: (orgnr: string) => void
  onCloseCompany: () => void
  /** «Endre i Innstillinger»: the lens is edited in Settings only (spec v3.6 B4). */
  onOpenSettings: () => void
}

export function CompaniesView({
  filters,
  onFiltersChange,
  selectedOrgnr,
  onOpenCompany,
  onCloseCompany,
  onOpenSettings,
}: CompaniesViewProps) {
  const { focus } = useFocus()
  // Read from context every render, so a lens change in Settings reaches this view live.
  const search = filters.q ?? ''
  // The box keeps its own text: bound straight to the URL, each keystroke would wait on the
  // router's async navigation, and React would put the old value back meanwhile (caret jumps to
  // the end, fast typing drops characters). The URL follows the box, and the box follows the URL
  // only when it changes from elsewhere (back/forward, a shared link).
  const [searchInput, setSearchInput] = useState(search)
  const lastPushedSearch = useRef(search)
  if (search !== lastPushedSearch.current) {
    lastPushedSearch.current = search
    setSearchInput(search)
  }
  const websiteFilter = filters.website ?? ''
  const adsFilter = filters.ads ?? ''
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // The row a company was opened from, which focus returns to when its dialog closes. Null for
  // a deep link, where the dialog falls back to its default.
  const openedFrom = useRef<string | null>(null)
  const t = useT()
  const formatNumber = useFormatNumber()

  const regions = focus?.regions ?? []

  // The search reaches the server a beat after typing stops, not on every keystroke.
  const [querySearch, setQuerySearch] = useState(search)
  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  // The display filter lives in this browser, so it travels with the request: whole fylker,
  // and the kommuner of a narrowed one.
  const params: CompanyListParams = {
    fylker: regions.filter((r) => r.kommuner.length === 0).map((r) => r.fylke),
    kommuner: regions.flatMap((r) => r.kommuner),
    q: querySearch,
    website: websiteFilter,
    ads: adsFilter,
  }
  const {
    data,
    isError,
    isPlaceholderData,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...companyPagesQuery(params), placeholderData: keepPreviousData })
  const visibleGroups = data?.pages.flatMap((page) => page.groups) ?? []
  const total = data?.pages[0]?.total ?? 0
  // Whether the answer on screen was filtered: the box runs ahead of the debounced query, and
  // keepPreviousData holds the last answer while the next loads, so the empty state goes by the
  // filters that answer was asked with.
  const queryFiltered = querySearch !== '' || websiteFilter !== '' || adsFilter !== ''
  const [filtered, setFiltered] = useState(queryFiltered)
  if (!isPlaceholderData && filtered !== queryFiltered) setFiltered(queryFiltered)
  const error = isError ? t('companies.loadError') : null

  // Chip names come from the kommune register (fetched once per session), not the list.
  const { data: register = [] } = useQuery(kommunerQuery())
  const kommuneNames = useMemo(
    () => new Map(register.map((k) => [k.number, k.name] as const)),
    [register]
  )

  const clearFilters = () => {
    setSearchInput('')
    lastPushedSearch.current = ''
    onFiltersChange({ q: undefined, website: undefined, ads: undefined })
  }

  const openDetail = (orgnr: string) => {
    openedFrom.current = orgnr
    onOpenCompany(orgnr)
  }

  // Every row rendered here is a group main: either a real hovedenhet, or a branch standing in
  // for one because its own parent wasn't loaded (an "orphan" branch). The tag only makes sense
  // in that second case: a real hovedenhet is never itself a branch.
  // A row is a sheet row (DESIGN.md): the name in the title column, the kommune on the time edge,
  // open ads at the right. On a phone the kommune and ads go to a subline under the name.
  const renderRow = (group: CompanyGroupDto) => {
    const c = group.main
    const openAds = groupOpenAds(group)
    return (
      <button
        type="button"
        className="flex min-h-13 w-full flex-col justify-center gap-0.5 border-0 bg-transparent px-0 py-2.5 text-start text-foreground hover:bg-muted md:flex-row md:items-center md:justify-start md:gap-0"
        ref={(el) => {
          if (el) rowRefs.current.set(c.orgnr, el)
          else rowRefs.current.delete(c.orgnr)
        }}
        onClick={() => openDetail(c.orgnr)}
      >
        <span className="min-w-0 md:w-90 md:shrink-0 md:truncate md:pe-5">
          <span className="font-medium">{displayCompanyName(c.name)}</span>
          {c.isBranch && (
            <>
              {' '}
              <span className="text-sm text-muted-foreground">{t('common.branchTag')}</span>
            </>
          )}
        </span>
        <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground md:contents">
          {/* Map lettering (DESIGN.md): a kommune is a place on the map. */}
          <span className="text-xs font-semibold tracking-widest text-contour uppercase md:flex-1">
            {c.kommuneNavn ?? c.kommune}
          </span>
          {openAds > 0 && (
            <span className="text-muted-foreground tabular-nums md:pe-3">
              {openAds === 1 ? t('companies.openAdsOne') : t('companies.openAds', { n: openAds })}
            </span>
          )}
        </span>
      </button>
    )
  }

  // The detail opens over the list rather than in its place, so the list keeps its scroll, its
  // loaded pages and its filters while a company is open.
  const detail = (
    <CompanyDetail
      orgnr={selectedOrgnr}
      onClose={onCloseCompany}
      finalFocus={() => {
        const row = openedFrom.current ? rowRefs.current.get(openedFrom.current) : undefined
        openedFrom.current = null
        return row ?? true
      }}
    />
  )

  if (error) {
    return (
      <>
        {detail}
        <p
          role="status"
          className="mt-6 flex flex-wrap items-center gap-x-3 border-y border-border py-3 font-sans text-body-sm md:mt-10"
        >
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {error}
          <Button variant="link" className="min-h-11" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      </>
    )
  }

  return (
    <div className="flex flex-col pt-6 font-sans md:pt-10">
      {detail}
      {/* The head: the count as the headline (it follows the filters, so it is the status a
      screen reader hears), then the display filter it is counted under. */}
      <p
        role="status"
        className="min-h-8 font-heading text-2xl font-semibold text-foreground tabular-nums md:min-h-10 md:text-headline"
      >
        {/* Empty until the first page answers, so it never flashes «0 bedrifter». */}
        {data &&
          (total === 1
            ? t('companies.countOne')
            : t('companies.count', { n: formatNumber(total) }))}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <RegionChips regions={regions} kommuneNames={kommuneNames} />
        <Button variant="link" className="-ms-2.5 min-h-11" onClick={onOpenSettings}>
          {t('companies.editInSettings')}
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 md:mt-7 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
        <div className="flex items-center gap-2">
          <label
            htmlFor="companies-search"
            className="w-20 text-sm text-muted-foreground md:w-auto"
          >
            {t('companies.search')}
          </label>
          <Input
            id="companies-search"
            type="search"
            className="flex-1 md:w-72 md:flex-none"
            value={searchInput}
            onChange={(event) => {
              const next = event.target.value
              setSearchInput(next)
              lastPushedSearch.current = next
              onFiltersChange({ q: next || undefined })
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="companies-website-filter"
            className="w-20 text-sm text-muted-foreground md:w-auto"
          >
            {t('companies.websiteFilterLabel')}
          </label>
          <NativeSelect
            id="companies-website-filter"
            size="touch"
            className="flex-1 md:flex-none"
            value={websiteFilter}
            onChange={(event) =>
              onFiltersChange({
                website: (event.target.value || undefined) as CompaniesFilters['website'],
              })
            }
          >
            <NativeSelectOption value="">{t('common.all')}</NativeSelectOption>
            <NativeSelectOption value="has">{t('companies.websiteHas')}</NativeSelectOption>
            <NativeSelectOption value="none">{t('companies.websiteNone')}</NativeSelectOption>
          </NativeSelect>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="companies-ads-filter"
            className="w-20 text-sm text-muted-foreground md:w-auto"
          >
            {t('companies.adsFilterLabel')}
          </label>
          <NativeSelect
            id="companies-ads-filter"
            size="touch"
            className="flex-1 md:flex-none"
            value={adsFilter}
            onChange={(event) =>
              onFiltersChange({ ads: (event.target.value || undefined) as CompaniesFilters['ads'] })
            }
          >
            <NativeSelectOption value="">{t('common.all')}</NativeSelectOption>
            <NativeSelectOption value="open">{t('companies.adsFilterOpen')}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      {data && total === 0 && (
        <p className="mt-6 flex flex-wrap items-center gap-x-3 border-t border-border pt-4 text-body-sm text-ink-tertiary md:mt-8">
          {filtered ? t('companies.emptyFiltered') : t('companies.empty')}
          {filtered && (
            <Button variant="link" className="min-h-11" onClick={clearFilters}>
              {t('companies.clearFilters')}
            </Button>
          )}
        </p>
      )}

      <ul className="mt-6 flex list-none flex-col border-b border-border ps-0 empty:hidden md:mt-8">
        {visibleGroups.map((g) => (
          <li key={g.main.orgnr} className="border-t border-border">
            {renderRow(g)}
          </li>
        ))}
      </ul>

      {hasNextPage && (
        <Button
          variant="outline"
          size="touch"
          className="mt-6 w-full self-start md:w-auto"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {t('companies.showMore', {
            n: Math.min(COMPANY_PAGE_SIZE, total - visibleGroups.length),
          })}
        </Button>
      )}
    </div>
  )
}
