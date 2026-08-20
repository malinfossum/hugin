import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import type { CompanyDto } from '../types'
import { CompanyDetail } from './CompanyDetail'

export function BedrifterView() {
  const [companies, setCompanies] = useState<CompanyDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [kommune, setKommune] = useState('')
  const [search, setSearch] = useState('')
  const [selectedOrgnr, setSelectedOrgnr] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const pendingFocusOrgnr = useRef<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    return api
      .get<CompanyDto[]>('/api/companies')
      .then(setCompanies)
      .catch(() => setError('Kunne ikke laste bedrifter.'))
  }, [])

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
    rowRefs.current.get(target)?.focus()
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
    return true
  })

  const openDetail = (orgnr: string) => {
    pendingFocusOrgnr.current = orgnr
    setSelectedOrgnr(orgnr)
  }

  const closeDetail = () => {
    setSelectedOrgnr(null)
  }

  if (selectedOrgnr) {
    return <CompanyDetail orgnr={selectedOrgnr} onClose={closeDetail} />
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          Prøv igjen
        </button>
      </p>
    )
  }

  return (
    <div className="bedrifter-view stack">
      <div className="bedrifter-filters cluster">
        <div className="field">
          <label className="label" htmlFor="bedrifter-kommune">
            Kommune
          </label>
          <select
            id="bedrifter-kommune"
            className="select"
            value={kommune}
            onChange={(event) => setKommune(event.target.value)}
          >
            <option value="">Alle</option>
            {kommuner.map(([number, name]) => (
              <option key={number} value={number}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="bedrifter-search">
            Søk
          </label>
          <input
            id="bedrifter-search"
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <p className="text-muted">{filtered.length} bedrifter</p>

      <ul className="stack stack-sm">
        {filtered.map((c) => (
          <li key={c.orgnr} className="stack stack-sm">
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
                <strong>{c.name}</strong>
                {c.isBranch && ' [avdeling]'}
              </span>
              <span className="text-muted">{c.kommuneNavn ?? c.kommune}</span>
            </button>
            {c.website && (
              <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-muted">
                {c.website}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
