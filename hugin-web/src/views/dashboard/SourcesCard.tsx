import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { sourceLabel } from '../../lib/links'
import { sourcesQuery } from '../../lib/queries'

/** The db-backed sources row from the old SyncHeader linkouts, now its own card (spec v3.2
 * item 6). Brreg and NAV are always first and come from i18n, not the fetched list. A fetch
 * failure still leaves those two usable. */
export function SourcesCard() {
  const { data: sources = [], isError, refetch } = useQuery(sourcesQuery())
  const t = useT()

  return (
    <section aria-labelledby="sources-heading" className="sources-card card stack stack-sm">
      <h2 id="sources-heading">{t('sources.title')}</h2>
      <p className="text-muted-foreground">{t('sources.description')}</p>
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
      {isError && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {t('sources.loadError')}
          <button type="button" className="btn btn-ghost" onClick={() => refetch()}>
            {t('common.retry')}
          </button>
        </p>
      )}
    </section>
  )
}
