import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useT } from '../../i18n'
import { sourceLabel } from '../../links'
import type { SourceDto } from '../../types'

/** The db-backed sources row from the old SyncHeader linkouts, now its own card (spec v3.2
 * item 6). Brreg and NAV are always first and come from i18n, not the fetched list — a fetch
 * failure still leaves those two usable. */
export function SourcesCard({ refreshToken }: { refreshToken: number }) {
  const [sources, setSources] = useState<SourceDto[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const t = useT()

  const load = useCallback(() => {
    setLoadError(null)
    return api
      .get<SourceDto[]>('/api/sources')
      .then(setSources)
      .catch(() => setLoadError(t('sources.loadError')))
  }, [t])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is a refetch trigger, not read in the body
  useEffect(() => {
    load()
  }, [load, refreshToken])

  return (
    <section aria-labelledby="sources-heading" className="sources-card card stack stack-sm">
      <h2 id="sources-heading">{t('sources.title')}</h2>
      <ul className="cluster cluster-sm">
        <li>
          <a href="https://www.brreg.no" target="_blank" rel="noopener noreferrer">
            {t('sync.brregLabel')}
          </a>
        </li>
        <li>
          <a
            href="https://arbeidsplassen.nav.no/stillinger"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('sync.navLabel')}
          </a>
        </li>
        {sources.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {sourceLabel(s.url, s.label)}
            </a>
          </li>
        ))}
      </ul>
      {loadError && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {loadError}
          <button type="button" className="btn btn-ghost" onClick={load}>
            {t('common.retry')}
          </button>
        </p>
      )}
    </section>
  )
}
