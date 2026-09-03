import { type ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api } from './api'
import { FirstRunDialog } from './components/FirstRunDialog'
import { HuginMark } from './components/HuginMark'
import { LiveRegionProvider } from './components/LiveRegion'
import { FocusProvider, useFocus } from './focus'
import { LanguageProvider, type TranslationKey, useT } from './i18n'
import { parseRoute, type Route, routePath } from './routing'
import { ApplicationsView } from './views/ApplicationsView'
import { BedrifterView } from './views/BedrifterView'
import { DashboardView } from './views/dashboard/DashboardView'
import { EksportView } from './views/EksportView'
import { SettingsView } from './views/SettingsView'
import './styles/main.css'

const VIEWS = ['dashboard', 'applications', 'companies', 'export', 'settings'] as const
export type ViewName = (typeof VIEWS)[number]

const VIEW_LABEL_KEYS: Record<ViewName, TranslationKey> = {
  dashboard: 'nav.dashboard',
  applications: 'nav.applications',
  companies: 'nav.companies',
  export: 'nav.export',
  settings: 'nav.settings',
}

function AppShell() {
  const { focus, setFocus } = useFocus()
  const [focusPromptDismissed, setFocusPromptDismissed] = useState(false)
  // Whether first-run has been completed (scope written) — a returning user with a stored focus
  // has; a fresh one hasn't even after the focus is seeded on a failed PUT, so the dialog stays
  // up for the retry. A Settings reset (focus → null) reopens it either way.
  const [firstRunDone, setFirstRunDone] = useState(() => focus !== null)
  const h1Ref = useRef<HTMLHeadingElement>(null)
  const focusDialogOpen = (focus === null || !firstRunDone) && !focusPromptDismissed
  const prevFocusDialogOpen = useRef(focusDialogOpen)
  const [route, setRouteState] = useState<Route>(() => parseRoute(window.location.pathname))
  const view = route.view
  const [visited, setVisited] = useState<ReadonlySet<ViewName>>(new Set([route.view]))
  const scrollByView = useRef<Map<ViewName, number>>(new Map())
  // popstate fires after the URL has already changed, so by the time the handler runs
  // `route` (the closed-over state) is the OUTGOING view — exactly what scroll memory needs.
  // A ref mirrors the latest route for that handler without re-subscribing it on every render.
  const routeRef = useRef(route)
  const t = useT()
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  )
  // Bumped after any Settings sources mutation; forwarded to the dashboard's SourcesCard as
  // refreshToken so it refetches without the two views needing any direct coupling.
  const [sourcesVersion, setSourcesVersion] = useState(0)
  const bumpSources = () => setSourcesVersion((v) => v + 1)

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try {
      window.localStorage.setItem('theme', next)
    } catch {
      /* choice just won't persist */
    }
    setTheme(next)
  }

  // Each view mounts once, on first visit, and then stays mounted (just hidden) so filters,
  // an opened detail, and scroll position all survive switching views — everything still resets
  // on a full app restart, which matches the spec. One side effect: the dashboard's SyncHeader
  // keeps polling while hidden behind another view — intended, since a running sync must finish
  // its announce/refresh cycle regardless of which view is currently visible. Declared inside
  // AppShell (not module scope) so the thunks can close over theme state and callbacks.
  const VIEW_COMPONENTS: Record<ViewName, () => ReactElement> = {
    dashboard: () => <DashboardView sourcesVersion={sourcesVersion} />,
    applications: () => <ApplicationsView />,
    companies: () => (
      <BedrifterView
        selectedOrgnr={route.company}
        onOpenCompany={(orgnr) => navigate({ view: 'companies', company: orgnr })}
        onCloseCompany={() => navigate({ view: 'companies', company: null })}
      />
    ),
    export: () => <EksportView />,
    settings: () => (
      <SettingsView theme={theme} onToggleTheme={toggleTheme} onSourcesChanged={bumpSources} />
    ),
  }

  // Applies a parsed/target route to state: marks its view visited (for keep-mounted) and
  // updates both the live route state and the ref popstate/navigate read scroll-memory from.
  // Wrapped in useCallback (stable identity, all deps are stable setters/refs) so the popstate
  // effect below can list it as a dependency without re-subscribing on every render.
  const apply = useCallback((next: Route) => {
    setVisited((prev) => (prev.has(next.view) ? prev : new Set(prev).add(next.view)))
    routeRef.current = next
    setRouteState(next)
  }, [])

  const navigate = (next: Route) => {
    if (routePath(next) === routePath(routeRef.current)) return
    scrollByView.current.set(routeRef.current.view, window.scrollY)
    window.history.pushState(null, '', routePath(next))
    apply(next)
  }

  const switchView = (next: ViewName) => navigate({ view: next, company: null })

  // Normalizes the initial URL (e.g. an unknown path collapses to '/') without adding a
  // history entry, so a stray Back right after load doesn't land on a path the app never
  // actually rendered.
  useEffect(() => {
    window.history.replaceState(null, '', routePath(routeRef.current))
  }, [])

  useEffect(() => {
    const onPopState = () => {
      scrollByView.current.set(routeRef.current.view, window.scrollY)
      apply(parseRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [apply])

  useLayoutEffect(() => {
    window.scrollTo(0, scrollByView.current.get(view) ?? 0)
  }, [view])

  // FirstRunDialog is a native <dialog> — while it's open+modal, everything outside it is
  // inert, so focusing the h1 from onSave/onDismiss while the dialog is still open is a no-op.
  // Instead watch the dialog-open boolean's true->false transition: child effects run before
  // parent effects, so FirstRunDialog has already called dialog.close() by the time this fires,
  // for both the Start (onSave) and Esc (onDismiss) paths alike.
  useEffect(() => {
    if (prevFocusDialogOpen.current && !focusDialogOpen) h1Ref.current?.focus()
    prevFocusDialogOpen.current = focusDialogOpen
  }, [focusDialogOpen])

  return (
    <LiveRegionProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="container cluster-between">
            <span className="brand">
              {/* Primary variant: the topbar mark renders at 2rem (32 px), the brand
                  pack's minimum for the primary mark — below that, use micro. */}
              <HuginMark variant="primary" className="brand-mark" />
              Hugin
            </span>
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
              <button
                type="button"
                className="nav-link"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? t('theme.toggleToLight') : t('theme.toggleToDark')}
              >
                <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
              </button>
            </div>
          </div>
        </header>
        <main className="container main-content stack stack-lg">
          <h1 ref={h1Ref} tabIndex={-1} className="visually-hidden">
            Hugin
          </h1>
          {VIEWS.filter((name) => visited.has(name)).map((name) => (
            <div key={name} hidden={name !== view}>
              {VIEW_COMPONENTS[name]()}
            </div>
          ))}
        </main>
      </div>
      <FirstRunDialog
        open={focusDialogOpen}
        onSaveFocus={(f, options) => setFocus(f, options)}
        onDone={() => setFirstRunDone(true)}
        onDismiss={() => {
          setFocusPromptDismissed(true)
          // Releases a held boot sync on a fresh install; a no-op 204 otherwise.
          api.post('/api/first-run-dismissed').catch(() => {})
        }}
      />
    </LiveRegionProvider>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <FocusProvider>
        <AppShell />
      </FocusProvider>
    </LanguageProvider>
  )
}
