import { useState } from 'react'
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

function AppShell() {
  const [view, setView] = useState<ViewName>('dashboard')
  const t = useT()
  const [lang, setLang] = useLang()

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
                        onClick={() => setView(name)}
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
          {view === 'dashboard' && <DashboardView />}
          {view === 'applications' && <ApplicationsView />}
          {view === 'companies' && <BedrifterView />}
          {view === 'export' && <EksportView />}
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
