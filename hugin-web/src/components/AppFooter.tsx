import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { REPO_URL } from '../lib/links'
import { statusQuery } from '../lib/queries'

/** NLOD 2.0 in the reader's language (both checked 2026-10-02). Brreg names NLOD as its licence
 * and NLOD asks for a source credit; NAV names no licence, so the licence sits on the Brreg half
 * only (spec v3.8 B2). */
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
    <footer className="app-footer">
      <p className="app-container cluster cluster-sm">
        {status?.version && <span>Hugin {status.version}</span>}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <span>
          {t('footer.adsCredit')} · {t('footer.companyCredit')} (
          <a href={NLOD_URL[lang]} target="_blank" rel="noopener noreferrer">
            NLOD
          </a>
          )
        </span>
      </p>
    </footer>
  )
}
