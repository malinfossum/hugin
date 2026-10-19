import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RegionChips } from '../components/RegionChips'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select'
import { useFocus } from '../context/focus'
import { useT } from '../i18n'
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
  const pendingFocusOrgnr = useRef<string | null>(null)
  const t = useT()

  useEffect(() => {
    if (selectedOrgnr !== null) return
    const target = pendingFocusOrgnr.current
    if (!target) return
    pendingFocusOrgnr.current = null
    // Safe to assume the ref is still mounted: filter inputs are unmounted while detail is
    // open (not just hidden), so the row list never re-filters behind our back. The
    // opening row is always present in rowRefs when we return to it. Branches no longer have
    // their own list row (they live as tabs inside CompanyDetail), so the target is always a
    // group's main or an orphan-standalone row, with no ancestor <details> to reopen anymore.
    const el = rowRefs.current.get(target)
    if (!el) return
    el.focus()
  }, [selectedOrgnr])

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
  const { data, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({ ...companyPagesQuery(params), placeholderData: keepPreviousData })
  const visibleGroups = data?.pages.flatMap((page) => page.groups) ?? []
  const total = data?.pages[0]?.total ?? 0
  const error = isError ? t('companies.loadError') : null

  // Chip names come from the kommune register (fetched once per session), not the list.
  const { data: register = [] } = useQuery(kommunerQuery())
  const kommuneNames = useMemo(
    () => new Map(register.map((k) => [k.number, k.name] as const)),
    [register]
  )

  const openDetail = (orgnr: string) => {
    pendingFocusOrgnr.current = orgnr
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
          <span className="md:flex-1">{c.kommuneNavn ?? c.kommune}</span>
          {openAds > 0 && (
            <span className="text-muted-foreground tabular-nums md:pe-3">
              {openAds === 1 ? t('companies.openAdsOne') : t('companies.openAds', { n: openAds })}
            </span>
          )}
        </span>
      </button>
    )
  }

  if (selectedOrgnr) {
    return <CompanyDetail orgnr={selectedOrgnr} onClose={onCloseCompany} />
  }

  if (error) {
    return (
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
    )
  }

  return (
    <div className="flex flex-col pt-6 font-sans md:pt-10">
      {/* The head: the count as the headline (it follows the filters, so it is the status a
      screen reader hears), then the display filter it is counted under. */}
      <p
        role="status"
        className="font-heading text-2xl font-semibold text-foreground tabular-nums md:text-headline"
      >
        {total === 1 ? t('companies.countOne') : t('companies.count', { n: total })}
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

      <ul className="mt-6 flex list-none flex-col border-b border-border ps-0 md:mt-8">
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
          className="mt-6 self-start max-md:w-full"
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
