import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { CompanyDetailDto } from '../types'

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('nb-NO') : '—'
}

function publishedText(published: string | null): string | null {
  return published ? `publisert ${formatDate(published)}` : null
}

export function CompanyDetail({ orgnr, onClose }: { orgnr: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CompanyDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    setDetail(null)
    return api
      .get<CompanyDetailDto>(`/api/companies/${orgnr}`)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Kunne ikke laste bedriften.')
      )
  }, [orgnr])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="company-detail card stack">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        Tilbake
      </button>

      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
            Prøv igjen
          </button>
        </p>
      )}

      {!error && detail && (
        <>
          <h2>
            {detail.company.name}
            {detail.company.isBranch && ' [avdeling]'}
          </h2>
          <dl className="company-detail-dl">
            <dt>Orgnr</dt>
            <dd>{detail.company.orgnr}</dd>
            <dt>Kommune</dt>
            <dd>{detail.company.kommuneNavn ?? detail.company.kommune ?? '—'}</dd>
            <dt>NACE</dt>
            <dd>{detail.company.naceCode ?? '—'}</dd>
            {detail.company.isBranch && detail.company.parentOrgnr && (
              <>
                <dt>Morselskap</dt>
                <dd>{detail.company.parentOrgnr}</dd>
              </>
            )}
          </dl>
          {detail.company.website && (
            <a href={detail.company.website} target="_blank" rel="noopener noreferrer">
              {detail.company.website}
            </a>
          )}

          <h3>Annonsehistorikk</h3>
          {detail.ads.length === 0 ? (
            <p className="empty-hint">(ingen annonser)</p>
          ) : (
            <ul className="stack stack-sm">
              {detail.ads.map((ad) => (
                <li key={ad.feedId} className="panel stack stack-sm">
                  <span className="text-strong">{ad.title}</span>
                  {!ad.isActive && <span className="badge">[utgått]</span>}
                  {publishedText(ad.published) && (
                    <span className="text-muted">{publishedText(ad.published)}</span>
                  )}
                  <span className="help">Frist: {formatDate(ad.expires)}</span>
                  {ad.sourceUrl && (
                    <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Se annonse hos NAV
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
