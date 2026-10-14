import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RegionChips } from '../components/RegionChips'
import { useFocus } from '../context/focus'
import { useT } from '../i18n'
import { displayCompanyName } from '../lib/companyName'
import { companiesQuery } from '../lib/queries'
import { regionMatches } from '../lib/regions'
import type { CompanyDto } from '../lib/types'
import { CompanyDetail } from './CompanyDetail'

interface CompanyGroup {
  main: CompanyDto
  branches: CompanyDto[]
}

/** Groups branches under their parent when the parent is in the list; parents keep
 * first-seen list order (API orders by name). A branch without a loaded parent is
 * its own group (enrichment usually loads parents, but never guaranteed).
 *
 * Assumes Brreg's register is strictly two-tier (hovedenhet + underenheter — no
 * underenhet is itself the parent of another underenhet). `!parent.isBranch` guards
 * that assumption: a branch whose `parentOrgnr` points at another branch (a chain, or
 * a mutual pair pointing at each other) does not get treated as a group main — it
 * falls back to its own standalone row instead of being duplicated as both a nested
 * branch and a top-level group. */
function groupCompanies(companies: CompanyDto[]): CompanyGroup[] {
  const byOrgnr = new Map(companies.map((c) => [c.orgnr, c]))
  const indexByOrgnr = new Map(companies.map((c, i) => [c.orgnr, i]))
  const groups = new Map<string, CompanyGroup>()
  for (const c of companies) {
    const parent = c.parentOrgnr ? byOrgnr.get(c.parentOrgnr) : undefined
    if (parent && parent.orgnr !== c.orgnr && !parent.isBranch) {
      const g = groups.get(parent.orgnr) ?? { main: parent, branches: [] }
      g.branches.push(c)
      groups.set(parent.orgnr, g)
    } else if (!groups.has(c.orgnr)) {
      groups.set(c.orgnr, { main: c, branches: [] })
    }
  }
  // Map insertion order reflects whichever member (main or branch) was first encountered while
  // walking the source list — a group can otherwise surface at a branch's earlier position. The
  // list is meant to read top-to-bottom in the source's own order, so re-sort by the MAIN unit's
  // own index once every group is known.
  return [...groups.values()].sort(
    (a, b) => (indexByOrgnr.get(a.main.orgnr) ?? 0) - (indexByOrgnr.get(b.main.orgnr) ?? 0)
  )
}

/** The row stands for the whole group, so its count is the group total: main plus branches. */
function groupOpenAds(group: CompanyGroup): number {
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
  /** «Endre i Innstillinger» — the lens is edited in Settings only (spec v3.6 B4). */
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
  const { data: companies = [], isError, refetch } = useQuery(companiesQuery())
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

  const error = isError ? t('companies.loadError') : null

  useEffect(() => {
    if (selectedOrgnr !== null) return
    const target = pendingFocusOrgnr.current
    if (!target) return
    pendingFocusOrgnr.current = null
    // Safe to assume the ref is still mounted: filter inputs are unmounted while detail is
    // open (not just hidden), so the row list never re-filters behind our back — the
    // opening row is always present in rowRefs when we return to it. Branches no longer have
    // their own list row (they live as tabs inside CompanyDetail), so the target is always a
    // group's main or an orphan-standalone row — no ancestor <details> to reopen anymore.
    const el = rowRefs.current.get(target)
    if (!el) return
    el.focus()
  }, [selectedOrgnr])

  const regions = focus?.regions ?? []

  // Chip names come from the companies already loaded — this view stays fetch-free. A kommune
  // with no company in the list shows by number, which is the RegionChips fallback.
  const kommuneNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const c of companies) if (c.kommune && c.kommuneNavn) names.set(c.kommune, c.kommuneNavn)
    return names
  }, [companies])

  const filtered = companies.filter((c) => {
    if (!regionMatches(c.kommune, regions)) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (websiteFilter === 'has' && !c.website) return false
    if (websiteFilter === 'none' && c.website) return false
    return true
  })

  // Group over the full list (not `filtered`) so a group whose main doesn't match but whose
  // branch does (or vice versa) still renders. Region, search and website are matched per unit,
  // then a group renders when the main or any branch matches. The ads filter applies to the
  // group: its open-ad total (the count the row shows) must be above 0. Non-matching branches
  // inside a visible group still render, as context, when the group is expanded.
  const matchingOrgnrs = new Set(filtered.map((c) => c.orgnr))
  const visibleGroups = groupCompanies(companies).filter(
    (g) =>
      (matchingOrgnrs.has(g.main.orgnr) || g.branches.some((b) => matchingOrgnrs.has(b.orgnr))) &&
      (adsFilter !== 'open' || groupOpenAds(g) > 0)
  )

  const openDetail = (orgnr: string) => {
    pendingFocusOrgnr.current = orgnr
    onOpenCompany(orgnr)
  }

  // Every row rendered here is a group main — either a real hovedenhet, or a branch standing in
  // for one because its own parent wasn't loaded (an "orphan" branch). The tag only makes sense
  // in that second case: a real hovedenhet is never itself a branch.
  const renderRow = (group: CompanyGroup) => {
    const c = group.main
    const openAds = groupOpenAds(group)
    return (
      <div className="companies-item">
        <button
          type="button"
          className="panel panel-hover companies-row"
          ref={(el) => {
            if (el) rowRefs.current.set(c.orgnr, el)
            else rowRefs.current.delete(c.orgnr)
          }}
          onClick={() => openDetail(c.orgnr)}
        >
          <span>
            <strong>{displayCompanyName(c.name)}</strong>
            {c.isBranch && ` ${t('common.branchTag')}`}
            {openAds > 0 && (
              <>
                {' '}
                <span className="text-muted">
                  {openAds === 1
                    ? t('companies.openAdsOne')
                    : t('companies.openAds', { n: openAds })}
                </span>
              </>
            )}
          </span>
          <span className="text-muted">{c.kommuneNavn ?? c.kommune}</span>
        </button>
      </div>
    )
  }

  if (selectedOrgnr) {
    return <CompanyDetail orgnr={selectedOrgnr} onClose={onCloseCompany} />
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={() => refetch()}>
          {t('common.retry')}
        </button>
      </p>
    )
  }

  return (
    <div className="companies-view stack">
      <div className="companies-lens cluster cluster-sm">
        <RegionChips regions={regions} kommuneNames={kommuneNames} />
        <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
          {t('companies.editInSettings')}
        </button>
      </div>

      <div className="companies-filters cluster">
        <div className="field">
          <label className="label" htmlFor="companies-search">
            {t('companies.search')}
          </label>
          <input
            id="companies-search"
            className="input"
            type="search"
            value={searchInput}
            onChange={(event) => {
              const next = event.target.value
              setSearchInput(next)
              lastPushedSearch.current = next
              onFiltersChange({ q: next || undefined })
            }}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="companies-website-filter">
            {t('companies.websiteFilterLabel')}
          </label>
          <select
            id="companies-website-filter"
            className="select"
            value={websiteFilter}
            onChange={(event) =>
              onFiltersChange({
                website: (event.target.value || undefined) as CompaniesFilters['website'],
              })
            }
          >
            <option value="">{t('common.all')}</option>
            <option value="has">{t('companies.websiteHas')}</option>
            <option value="none">{t('companies.websiteNone')}</option>
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="companies-ads-filter">
            {t('companies.adsFilterLabel')}
          </label>
          <select
            id="companies-ads-filter"
            className="select"
            value={adsFilter}
            onChange={(event) =>
              onFiltersChange({ ads: (event.target.value || undefined) as CompaniesFilters['ads'] })
            }
          >
            <option value="">{t('common.all')}</option>
            <option value="open">{t('companies.adsFilterOpen')}</option>
          </select>
        </div>
      </div>

      <p role="status" className="text-muted">
        {visibleGroups.length === 1
          ? t('companies.countOne')
          : t('companies.count', { n: visibleGroups.length })}
      </p>

      <ul className="stack stack-sm">
        {visibleGroups.map((g) => (
          <li key={g.main.orgnr}>{renderRow(g)}</li>
        ))}
      </ul>
    </div>
  )
}
