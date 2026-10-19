import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useLang, useT } from '../i18n'
import { REPO_URL } from '../lib/links'
import { statusQuery } from '../lib/queries'

/** NLOD 2.0 in the reader's language (both checked 2026-10-02). Brreg names NLOD as its licence
 * and NLOD asks for a source credit; NAV names no licence, so the licence sits on the Brreg half
 * only (spec v3.8 B2). */
/** DESIGN.md links: ink, a strong-hairline underline at rest that turns currentColor on hover. */
const LINK =
  'text-foreground underline decoration-input underline-offset-3 hover:decoration-current'

const NLOD_URL = {
  nb: 'https://data.norge.no/nlod/no/2.0',
  en: 'https://data.norge.no/nlod/en/2.0',
} as const

/** The page's last line: version, source code and the data credit (spec v3.8 B2). The version
 * comes from the status query the app already runs at boot, so this costs no request, and it is
 * left out when that fetch failed. */
export function AppFooter() {
  const t = useT()
  const [lang] = useLang()
  const { data: status } = useQuery(statusQuery())

  return (
    // Muted, small and centred. Small text does not mean small targets: each link's hit box is
    // 44 px tall. The GitHub link takes that height as the row's; NLOD sits in running text.
    <footer className="border-t border-border font-sans text-small text-muted-foreground">
      <p className="mx-auto flex max-w-sheet flex-wrap items-center justify-center gap-x-3 px-4.5 text-center md:px-12">
        {status?.version && <span>Hugin {status.version}</span>}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('inline-flex min-h-11 items-center', LINK)}
        >
          GitHub
        </a>
        <span>
          {t('footer.adsCredit')} · {t('footer.companyCredit')} (
          <a
            href={NLOD_URL[lang]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('inline-target', LINK)}
          >
            NLOD
          </a>
          )
        </span>
      </p>
    </footer>
  )
}
