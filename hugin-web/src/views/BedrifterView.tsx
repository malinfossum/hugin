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
    rowRefs.current.get(target)?.focus()
  }, [selectedOrgnr])

  const kommuner = useMemo(() => {
    const values = companies
      .map((c) => c.kommune)
      .filter((k): k is string => k !== null && k !== '')
    return Array.from(new Set(values)).sort()
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
      <p role="status">
        {error}{' '}
        <button type="button" onClick={load}>
          Prøv igjen
        </button>
      </p>
    )
  }

  return (
    <div className="bedrifter-view">
      <div className="bedrifter-filters">
        <label htmlFor="bedrifter-kommune">Kommune</label>
        <select
          id="bedrifter-kommune"
          value={kommune}
          onChange={(event) => setKommune(event.target.value)}
        >
          <option value="">Alle</option>
          {kommuner.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <label htmlFor="bedrifter-search">Søk</label>
        <input
          id="bedrifter-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <p>{filtered.length} bedrifter</p>

      <ul>
        {filtered.map((c) => (
          <li key={c.orgnr}>
            <button
              type="button"
              ref={(el) => {
                if (el) rowRefs.current.set(c.orgnr, el)
                else rowRefs.current.delete(c.orgnr)
              }}
              onClick={() => openDetail(c.orgnr)}
            >
              <span>
                {c.name}
                {c.isBranch && ' [avdeling]'}
              </span>
              <span>{c.kommune}</span>
            </button>
            {c.website && (
              <a href={c.website} target="_blank" rel="noopener noreferrer">
                {c.website}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
