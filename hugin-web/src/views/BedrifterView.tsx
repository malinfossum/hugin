import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { displayCompanyName } from '../companyName'
import { useT } from '../i18n'
import type { CompanyDto } from '../types'
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
  return [...groups.values()]
}

interface BedrifterViewProps {
  selectedOrgnr: string | null
  onOpenCompany: (orgnr: string) => void
  onCloseCompany: () => void
}

export function BedrifterView({
  selectedOrgnr,
  onOpenCompany,
  onCloseCompany,
}: BedrifterViewProps) {
  const [companies, setCompanies] = useState<CompanyDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [kommune, setKommune] = useState('')
  const [search, setSearch] = useState('')
  const [websiteFilter, setWebsiteFilter] = useState<'' | 'has' | 'none'>('')
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const pendingFocusOrgnr = useRef<string | null>(null)
  const t = useT()

  const load = useCallback(() => {
    setError(null)
    return api
      .get<CompanyDto[]>('/api/companies')
      .then(setCompanies)
      .catch(() => setError(t('companies.loadError')))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (selectedOrgnr !== null) return
    const target = pendingFocusOrgnr.current
    if (!target) return
    pendingFocusOrgnr.current = null
    // Safe to assume the ref is still mounted: filter inputs are unmounted while detail is
    // open (not just hidden), so the row list never re-filters behind our back — the
    // opening row is always present in rowRefs when we return to it.
    const el = rowRefs.current.get(target)
    if (!el) return
    // A branch row's <details> remounts closed on back-navigation. Non-summary content of a
    // closed <details> is unfocusable in real browsers (jsdom doesn't enforce this, which is
    // why it wouldn't show up in tests otherwise) — open every ancestor <details> first, both
    // to make the row focusable and to restore the user's visual context (the group re-opens).
    for (let ancestor = el.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true
    }
    el.focus()
  }, [selectedOrgnr])

  const kommuner = useMemo(() => {
    const byNumber = new Map<string, string>()
    for (const c of companies) {
      if (!c.kommune) continue
      if (!byNumber.has(c.kommune)) byNumber.set(c.kommune, c.kommuneNavn ?? c.kommune)
    }
    return Array.from(byNumber.entries()).sort(([, a], [, b]) => a.localeCompare(b))
  }, [companies])

  const filtered = companies.filter((c) => {
    if (kommune && c.kommune !== kommune) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (websiteFilter === 'has' && !c.website) return false
    if (websiteFilter === 'none' && c.website) return false
    return true
  })

  // Group over the full list (not `filtered`) so a group whose main doesn't match but whose
  // branch does (or vice versa) still renders — matching is applied per-unit, then a group
  // renders when the main or any branch matches. Non-matching branches inside a visible group
  // still render, as context, when the group is expanded.
  const matchingOrgnrs = new Set(filtered.map((c) => c.orgnr))
  const visibleGroups = groupCompanies(companies).filter(
    (g) => matchingOrgnrs.has(g.main.orgnr) || g.branches.some((b) => matchingOrgnrs.has(b.orgnr))
  )

  const openDetail = (orgnr: string) => {
    pendingFocusOrgnr.current = orgnr
    onOpenCompany(orgnr)
  }

  // A branch rendered as a standalone group main (its parent isn't loaded) still needs the
  // tag — the group context that would otherwise convey it doesn't exist. Branch rows nested
  // inside an expanded group skip it: the "N branches" summary above already says so.
  const renderRow = (c: CompanyDto, standalone: boolean) => (
    <div className="bedrifter-item">
      <button
        type="button"
        className="panel panel-hover bedrifter-row"
        ref={(el) => {
          if (el) rowRefs.current.set(c.orgnr, el)
          else rowRefs.current.delete(c.orgnr)
        }}
        onClick={() => openDetail(c.orgnr)}
      >
        <span>
          <strong>{displayCompanyName(c.name)}</strong>
          {standalone && c.isBranch && ` ${t('common.branchTag')}`}
        </span>
        <span className="text-muted">{c.kommuneNavn ?? c.kommune}</span>
      </button>
    </div>
  )

  if (selectedOrgnr) {
    return <CompanyDetail orgnr={selectedOrgnr} onClose={onCloseCompany} />
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          {t('common.retry')}
        </button>
      </p>
    )
  }

  return (
    <div className="bedrifter-view stack">
      <div className="bedrifter-filters cluster">
        <div className="field">
          <label className="label" htmlFor="bedrifter-kommune">
            {t('companies.kommune')}
          </label>
          <select
            id="bedrifter-kommune"
            className="select"
            value={kommune}
            onChange={(event) => setKommune(event.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {kommuner.map(([number, name]) => (
              <option key={number} value={number}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="bedrifter-search">
            {t('companies.search')}
          </label>
          <input
            id="bedrifter-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="bedrifter-website-filter">
            {t('companies.websiteFilterLabel')}
          </label>
          <select
            id="bedrifter-website-filter"
            className="select"
            value={websiteFilter}
            onChange={(event) => setWebsiteFilter(event.target.value as '' | 'has' | 'none')}
          >
            <option value="">{t('common.all')}</option>
            <option value="has">{t('companies.websiteHas')}</option>
            <option value="none">{t('companies.websiteNone')}</option>
          </select>
        </div>
      </div>

      <p className="text-muted">{t('companies.count', { n: filtered.length })}</p>

      <ul className="stack stack-sm">
        {visibleGroups.map((g) => (
          <li key={g.main.orgnr} className="stack stack-sm">
            {renderRow(g.main, true)}
            {g.branches.length > 0 && (
              <details className="bedrifter-branches">
                <summary>
                  {g.branches.length === 1
                    ? t('companies.branchCountOne')
                    : t('companies.branchCount', { n: g.branches.length })}
                </summary>
                <ul className="stack stack-sm">
                  {g.branches.map((b) => (
                    <li key={b.orgnr}>{renderRow(b, false)}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
