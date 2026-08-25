import { useT } from '../i18n'
import { googleSearchUrl } from '../links'

/** Every company row/detail always offers a working link (spec decision 6, amended v3.2):
 * the verified website when present, else a muted note plus a Google search fallback.
 * Proff dropped from the fallback in v3.2 — it lives on only as a seeded header source. */
export function CompanyLink({
  name,
  kommuneNavn,
  website,
  className,
}: {
  name: string
  kommuneNavn: string | null
  website: string | null
  className?: string
}) {
  const t = useT()

  if (website) {
    return (
      <a href={website} target="_blank" rel="noopener noreferrer" className={className}>
        {website}
      </a>
    )
  }

  return (
    <span className={`cluster cluster-sm ${className ?? ''}`.trim()}>
      {t('companies.noWebsite')} —
      <a href={googleSearchUrl(name, kommuneNavn)} target="_blank" rel="noopener noreferrer">
        {t('companies.googleSearch')}
      </a>
    </span>
  )
}
