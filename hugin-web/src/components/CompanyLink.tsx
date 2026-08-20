import { googleSearchUrl, proffSearchUrl } from '../links'

/** Every company row/detail always offers a working link (spec decision 6): the verified
 * website when present, else a muted note plus Google and Proff.no search fallbacks. */
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
  if (website) {
    return (
      <a href={website} target="_blank" rel="noopener noreferrer" className={className}>
        {website}
      </a>
    )
  }

  return (
    <span className={`cluster cluster-sm ${className ?? ''}`.trim()}>
      har ikke egen nettside —
      <a href={googleSearchUrl(name, kommuneNavn)} target="_blank" rel="noopener noreferrer">
        Google-søk
      </a>
      <a href={proffSearchUrl(name)} target="_blank" rel="noopener noreferrer">
        Proff
      </a>
    </span>
  )
}
