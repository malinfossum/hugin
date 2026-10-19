import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { useT } from '../../i18n'
import { sourceLabel } from '../../lib/links'
import { sourcesQuery } from '../../lib/queries'

/** The db-backed sources row from the old SyncHeader linkouts, now its own card (spec v3.2
 * item 6). Brreg and NAV are always first and come from i18n, not the fetched list. A fetch
 * failure still leaves those two usable. */
export function SourcesCard() {
  const { data: sources = [], isError, refetch } = useQuery(sourcesQuery())
  const t = useT()

  // DESIGN.md: a quiet line at the foot of the sheet, not a card.
  return (
    <section
      aria-labelledby="sources-heading"
      className="mt-12 flex flex-col gap-2 border-t border-border pt-3 pb-2 font-sans text-sm md:flex-row md:flex-wrap md:items-center md:gap-x-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="sources-heading" className="font-sans text-sm font-medium">
          {t('sources.title')}
        </h2>
        <p className="text-small text-muted-foreground">{t('sources.description')}</p>
      </div>
      <ul className="flex list-none flex-wrap gap-x-5.5 ps-0">
        <li>
          <a
            href="https://www.brreg.no"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-foreground no-underline hover:underline"
          >
            {t('sync.brregLabel')}
            <ExternalLink aria-hidden="true" className="size-3 text-ink-tertiary" />
          </a>
        </li>
        <li>
          <a
            href="https://arbeidsplassen.nav.no/stillinger"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-foreground no-underline hover:underline"
          >
            {t('sync.navLabel')}
            <ExternalLink aria-hidden="true" className="size-3 text-ink-tertiary" />
          </a>
        </li>
        {sources.map((s) => (
          <li key={s.id}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-foreground no-underline hover:underline"
            >
              {sourceLabel(s.url, s.label)}
              <ExternalLink aria-hidden="true" className="size-3 text-ink-tertiary" />
            </a>
          </li>
        ))}
      </ul>
      {isError && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 text-body-sm">
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {t('sources.loadError')}
          <Button variant="link" className="min-h-11" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
    </section>
  )
}
