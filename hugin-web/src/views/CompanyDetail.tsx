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
    <div className="company-detail">
      <button type="button" onClick={onClose}>
        Tilbake
      </button>

      {error && (
        <p role="status">
          {error}{' '}
          <button type="button" onClick={load}>
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
          <dl>
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
            <p>(ingen annonser)</p>
          ) : (
            <ul>
              {detail.ads.map((ad) => (
                <li key={ad.feedId}>
                  <span>{ad.title}</span>
                  {!ad.isActive && <span>[utgått]</span>}
                  {publishedText(ad.published) && <span>{publishedText(ad.published)}</span>}
                  <span>Frist: {formatDate(ad.expires)}</span>
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
