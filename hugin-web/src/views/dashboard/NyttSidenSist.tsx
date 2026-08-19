import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAnnounce } from '../../components/LiveRegion'
import type { CompanyDto, NewDto } from '../../types'

/** Groups companies by kommune, preserving first-seen order of both groups and members. */
function groupByKommune(companies: CompanyDto[]): [string, CompanyDto[]][] {
  const groups = new Map<string, CompanyDto[]>()
  for (const company of companies) {
    const key = company.kommune ?? 'Ukjent kommune'
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
    <section aria-labelledby="nytt-heading" className="nytt-siden-sist">
      <h2 id="nytt-heading" ref={headingRef} tabIndex={-1}>
        Nytt siden sist
      </h2>
      {error && (
        <p role="status">
          {error}{' '}
          <button type="button" onClick={load}>
            Prøv igjen
          </button>
        </p>
      )}
      {!error && loaded && data === undefined && <p>Ingen sync er kjørt ennå — trykk Synk nå.</p>}
      {!error && loaded && data && (
        <>
          <h3>Nye bedrifter ({data.companies.length})</h3>
          {groupByKommune(data.companies).map(([kommune, companies]) => (
            <div key={kommune}>
              <h4>{kommune}</h4>
              <ul>
                {companies.map((company) => (
                  <li key={company.orgnr}>
                    {company.name}
                    {company.isBranch ? ' [avdeling]' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <h3>Nye annonser ({data.ads.length})</h3>
          {data.ads.length > 0 && (
            <ul>
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

          {hasNew ? (
            <button
              type="button"
              onClick={() => {
                reviewedAsOf.current = data.asOf
                setConfirmOpen(true)
              }}
            >
              Merk som sett
            </button>
          ) : (
            <p>(ingen nye)</p>
          )}
        </>
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
