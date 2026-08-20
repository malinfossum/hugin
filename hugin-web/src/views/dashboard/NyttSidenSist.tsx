import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAnnounce } from '../../components/LiveRegion'
import type { CompanyDto, NewDto } from '../../types'

/** Groups companies by kommune, preserving first-seen order of both groups and members. */
function groupByKommune(companies: CompanyDto[]): [string, CompanyDto[]][] {
  const groups = new Map<string, CompanyDto[]>()
  for (const company of companies) {
    const key = company.kommuneNavn ?? company.kommune ?? 'ukjent'
    const group = groups.get(key)
    if (group) group.push(company)
    else groups.set(key, [company])
  }
  return [...groups.entries()]
}

export function NyttSidenSist({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<NewDto | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const announce = useAnnounce()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef(false)
  // Snapshot of the asOf the user was actually looking at when they opened the dialog.
  // A refetch (refreshKey bump) while the dialog is open must not change what gets posted —
  // that would mark items the user never reviewed as seen.
  const reviewedAsOf = useRef<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    return api
      .get<NewDto | undefined>('/api/new')
      .then((result) => {
        setData(result)
        setLoaded(true)
      })
      .catch(() => setError('Kunne ikke laste nytt siden sist.'))
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshKey])

  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the refetch-completed signal that applies the pending focus move
  useEffect(() => {
    if (!pendingFocus.current) return
    pendingFocus.current = false
    headingRef.current?.focus()
  }, [data])

  const handleConfirm = async () => {
    const asOf = reviewedAsOf.current
    if (!asOf) return
    setConfirmOpen(false)
    try {
      await api.post('/api/seen', { asOf })
    } catch {
      setError('Kunne ikke merke som sett.')
      return
    }
    reviewedAsOf.current = null
    pendingFocus.current = true
    await load()
    announce('Merket som sett.')
  }

  const handleCancel = () => {
    reviewedAsOf.current = null
    setConfirmOpen(false)
  }

  const hasNew = !!data && (data.companies.length > 0 || data.ads.length > 0)

  return (
    <section aria-labelledby="nytt-heading" className="nytt-siden-sist card stack">
      <h2 id="nytt-heading" ref={headingRef} tabIndex={-1}>
        Nytt siden sist
      </h2>
      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
            Prøv igjen
          </button>
        </p>
      )}
      {!error && loaded && data === undefined && (
        <p className="empty-hint">Ingen sync er kjørt ennå — trykk Synk nå.</p>
      )}
      {!error && loaded && data && (
        <div className="stack">
          <div className="stack stack-sm">
            <h3>Nye bedrifter ({data.companies.length})</h3>
            {groupByKommune(data.companies).map(([kommune, companies]) => (
              <div key={kommune} className="stack stack-sm">
                <h4 className="text-muted">{kommune}</h4>
                <ul className="stack stack-sm">
                  {companies.map((company) => (
                    <li key={company.orgnr}>
                      {company.name}
                      {company.isBranch ? ' [avdeling]' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="stack stack-sm">
            <h3>Nye annonser ({data.ads.length})</h3>
            {data.ads.length > 0 && (
              <ul className="stack stack-sm">
                {data.ads.map((ad) => (
                  <li key={ad.feedId}>
                    {ad.sourceUrl ? (
                      <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {ad.title}
                      </a>
                    ) : (
                      <span>{ad.title}</span>
                    )}{' '}
                    — {ad.employer}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hasNew ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                reviewedAsOf.current = data.asOf
                setConfirmOpen(true)
              }}
            >
              Merk som sett
            </button>
          ) : (
            <p className="empty-hint">(ingen nye)</p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Merket flyttes — dette kan ikke angres."
        confirmLabel="Merk som sett"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </section>
  )
}
