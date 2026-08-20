import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { CompanyLink } from '../components/CompanyLink'
import { localeFor, type T, useLang, useT } from '../i18n'
import type { CompanyDetailDto } from '../types'

function formatDate(value: string | null, locale: string): string {
  return value ? new Date(value).toLocaleDateString(locale) : '—'
}

function publishedText(published: string | null, locale: string, t: T): string | null {
  return published ? t('companies.published', { date: formatDate(published, locale) }) : null
}

export function CompanyDetail({ orgnr, onClose }: { orgnr: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CompanyDetailDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const [lang] = useLang()
  const locale = localeFor(lang)

  const load = useCallback(() => {
    setError(null)
    setDetail(null)
    return api
      .get<CompanyDetailDto>(`/api/companies/${orgnr}`)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('companies.detailLoadError'))
      )
  }, [orgnr, t])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="company-detail card stack">
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        {t('common.back')}
      </button>

      {error && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {error}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}

      {!error && detail && (
        <>
          <h2>
            {detail.company.name}
            {detail.company.isBranch && ` ${t('common.branchTag')}`}
          </h2>
          <dl className="company-detail-dl">
            <dt>{t('companies.orgnr')}</dt>
            <dd>{detail.company.orgnr}</dd>
            <dt>{t('companies.kommune')}</dt>
            <dd>{detail.company.kommuneNavn ?? detail.company.kommune ?? '—'}</dd>
            <dt>{t('companies.nace')}</dt>
            <dd>{detail.company.naceCode ?? '—'}</dd>
            {detail.company.isBranch && detail.company.parentOrgnr && (
              <>
                <dt>{t('companies.parentCompany')}</dt>
                <dd>{detail.company.parentOrgnr}</dd>
              </>
            )}
          </dl>
          <CompanyLink
            name={detail.company.name}
            kommuneNavn={detail.company.kommuneNavn}
            website={detail.company.website}
          />

          <h3>{t('companies.adHistory')}</h3>
          {detail.ads.length === 0 ? (
            <p className="empty-hint">{t('companies.noAds')}</p>
          ) : (
            <ul className="stack stack-sm">
              {detail.ads.map((ad) => (
                <li key={ad.feedId} className="panel stack stack-sm">
                  <span className="text-strong">{ad.title}</span>
                  {!ad.isActive && <span className="badge">{t('companies.expiredTag')}</span>}
                  {publishedText(ad.published, locale, t) && (
                    <span className="text-muted">{publishedText(ad.published, locale, t)}</span>
                  )}
                  <span className="help">
                    {t('companies.deadlineLabel', { date: formatDate(ad.expires, locale) })}
                  </span>
                  {ad.sourceUrl && (
                    <a href={ad.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {t('companies.seeAdAtNav')}
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
