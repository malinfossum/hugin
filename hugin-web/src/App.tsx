import { type ReactElement, useLayoutEffect, useRef, useState } from 'react'
import { LiveRegionProvider } from './components/LiveRegion'
import { LanguageProvider, type TranslationKey, useLang, useT } from './i18n'
import { ApplicationsView } from './views/ApplicationsView'
import { BedrifterView } from './views/BedrifterView'
import { DashboardView } from './views/dashboard/DashboardView'
import { EksportView } from './views/EksportView'
import './styles/main.css'

const VIEWS = ['dashboard', 'applications', 'companies', 'export'] as const
export type ViewName = (typeof VIEWS)[number]

const VIEW_LABEL_KEYS: Record<ViewName, TranslationKey> = {
  dashboard: 'nav.dashboard',
  applications: 'nav.applications',
  companies: 'nav.companies',
  export: 'nav.export',
}

// Each view mounts once, on first visit, and then stays mounted (just hidden) so filters,
// an opened detail, and scroll position all survive switching views — everything still resets
// on a full app restart, which matches the spec. One side effect: the dashboard's SyncHeader
// keeps polling while hidden behind another view — intended, since a running sync must finish
// its announce/refresh cycle regardless of which view is currently visible.
const VIEW_COMPONENTS: Record<ViewName, () => ReactElement> = {
  dashboard: () => <DashboardView />,
  applications: () => <ApplicationsView />,
  companies: () => <BedrifterView />,
  export: () => <EksportView />,
}

function AppShell() {
  const [view, setView] = useState<ViewName>('dashboard')
  const [visited, setVisited] = useState<ReadonlySet<ViewName>>(new Set(['dashboard']))
  const scrollByView = useRef<Map<ViewName, number>>(new Map())
  const t = useT()
  const [lang, setLang] = useLang()

  const switchView = (next: ViewName) => {
    if (next === view) return
    scrollByView.current.set(view, window.scrollY)
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
    setView(next)
  }

  useLayoutEffect(() => {
    window.scrollTo(0, scrollByView.current.get(view) ?? 0)
  }, [view])

  return (
    <LiveRegionProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="container cluster-between">
            <span className="brand">Hugin</span>
            <div className="topbar-controls cluster cluster-sm">
              <nav aria-label={t('nav.ariaLabel')}>
                <ul className="nav-list">
                  {VIEWS.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        className="nav-link"
                        onClick={() => switchView(name)}
                        aria-current={view === name ? 'page' : undefined}
                      >
                        {t(VIEW_LABEL_KEYS[name])}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
              <fieldset className="lang-toggle cluster cluster-sm">
                <legend className="visually-hidden">{t('lang.toggleLabel')}</legend>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-pressed={lang === 'nb'}
                  onClick={() => setLang('nb')}
                >
                  NO
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-pressed={lang === 'en'}
                  onClick={() => setLang('en')}
                >
                  EN
                </button>
              </fieldset>
            </div>
          </div>
        </header>
        <main className="container main-content stack stack-lg">
          <h1 className="visually-hidden">Hugin</h1>
          {VIEWS.filter((name) => visited.has(name)).map((name) => (
            <div key={name} hidden={name !== view}>
              {VIEW_COMPONENTS[name]()}
            </div>
          ))}
        </main>
      </div>
    </LiveRegionProvider>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  )
}
