import { cn } from '@/lib/utils'
import { useT } from '../i18n'
import { googleSearchUrl } from '../lib/links'

/** DESIGN.md links: ink, a strong-hairline underline at rest that turns currentColor on hover. */
const LINK =
  'text-foreground underline decoration-input underline-offset-3 hover:decoration-current'

/** Every company row/detail always offers a working link (spec decision 6, amended v3.2):
 * the verified website when present, else a muted note plus a Google search fallback.
 * Proff dropped from the fallback in v3.2. It lives on only as a seeded header source. */
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
      <a href={website} target="_blank" rel="noopener noreferrer" className={cn(LINK, className)}>
        {website}
      </a>
    )
  }

  return (
    <span className={cn('inline-flex flex-wrap gap-x-1.5', className)}>
      {t('companies.noWebsite')}:
      <a
        href={googleSearchUrl(name, kommuneNavn)}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        {t('companies.googleSearch')}
      </a>
    </span>
  )
}
