import { useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Globe, Moon, Sun } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppFooter } from './components/AppFooter'
import { FirstRunDialog } from './components/FirstRunDialog'
import { HuginMark } from './components/HuginMark'
import { LiveRegionProvider } from './components/LiveRegion'
import { SyncWatcherProvider } from './components/SyncWatcher'
import { Button } from './components/ui/button'
import { KNOWN_CATEGORIES, useFocus } from './context/focus'
import { useReadOnly } from './context/readOnly'
import { ReturnFocusProvider } from './context/returnFocus'
import { type TranslationKey, useLang, useT } from './i18n'
import { fromDiscoveryConfig, toFocusSeed } from './lib/coverage'
import { REPO_URL } from './lib/links'
import { useDismissFirstRun } from './lib/mutations'
import { discoveryQuery, queryKeys } from './lib/queries'
import './styles/legacy.css'
import './styles/index.css'

const NAV = [
  { to: '/', exact: true, labelKey: 'nav.dashboard' },
  { to: '/applications', exact: false, labelKey: 'nav.applications' },
  // Cleared explicitly: a Link without params reuses the current ones, which on a company's
  // detail would point right back at that company instead of the list.
  {
    to: '/companies/{-$orgnr}',
    exact: false,
    labelKey: 'nav.companies',
    params: { orgnr: undefined },
  },
  { to: '/export', exact: false, labelKey: 'nav.export' },
  { to: '/settings', exact: false, labelKey: 'nav.settings' },
] as const satisfies readonly {
  to: string
  exact: boolean
  labelKey: TranslationKey
  params?: object
}[]

interface ShellActions {
  /** Reopens the first-run dialog. Used by the dashboard's empty-coverage prompt (SyncHeader). */
  requestCoverage: () => void
}

const ShellContext = createContext<ShellActions>({ requestCoverage: () => {} })

/** What a route's view may ask of the shell around it. */
export function useShell(): ShellActions {
  return useContext(ShellContext)
}

/** The root route's component: topbar, demo banner, first-run dialog, and the matched view in
 * the middle. Views mount when their route matches and unmount when it stops matching; anything
 * that should survive navigation lives in the URL (search params) or the query cache. */
export function AppShell() {
  const { focus, setFocus } = useFocus()
  const { readOnly, resolved, scopeConfigured, markScopeConfigured } = useReadOnly()
  const [focusPromptDismissed, setFocusPromptDismissed] = useState(false)
  // Whether first-run has been completed (scope written). A returning user with a stored focus
  // has; a fresh one hasn't even after the focus is seeded on a failed PUT, so the dialog stays
  // up for the retry. A Settings reset (focus → null) reopens it either way.
  const [firstRunDone, setFirstRunDone] = useState(() => focus !== null)
  const h1Ref = useRef<HTMLHeadingElement>(null)
  // Each view's search params as it was last left, so the nav returns to a view with its filters
  // (Companies' ?q=, the dashboard's ?show=all) instead of resetting them. The views themselves
  // unmount on navigation; the URL is where that state lives.
  const routeId = useRouterState({ select: (s) => s.matches.at(-1)?.routeId })
  // Both from the leaf match, never `location`: the location moves ahead of the matches during a
  // navigation, which would pair the old route with the new route's search.
  const search = useRouterState({ select: (s) => s.matches.at(-1)?.search ?? {} })
  const lastSearch = useRef<Record<string, object>>({})
  useEffect(() => {
    if (routeId) lastSearch.current[routeId] = search
  }, [routeId, search])
  // The search a link to `to` should carry: the current one when it points at this view, else the
  // one that view was last left with. The nav items and the logo share it.
  const searchFor = (to: string) => (to === routeId ? search : (lastSearch.current[to] ?? {}))
  // Never before /api/status has answered (a fresh visitor would see it flash, or worse, get it
  // for real and a Save that can only 403), and never on the read-only demo. `scopeConfigured
  // === false` catches a browser that already has a stored focus but the server has no scope
  // (v3.5 Part A3/D1). A stale localStorage focus alone can no longer hide that. Reuses the
  // status ReadOnlyProvider already fetched at boot; no second poll. `scopeConfigured` is a live
  // value (readOnly.tsx's `markScopeConfigured`), not a frozen snapshot: onDone below flips it
  // the moment first-run writes a scope, so this condition actually clears instead of reopening
  // the dialog it just closed (Task 11 finding 1).
  const focusDialogOpen =
    resolved &&
    !readOnly &&
    (focus === null || !firstRunDone || scopeConfigured === false) &&
    !focusPromptDismissed
  const prevFocusDialogOpen = useRef(focusDialogOpen)
  const queryClient = useQueryClient()
  const dismissFirstRun = useDismissFirstRun()
  // A finished sync changes the ads, the "new since last visit" digest, the company list and each
  // company's detail; the views that show them refetch via these keys. A detail is kept fresh for
  // a minute (companyQuery), so without its key one visited before the sync would reopen stale.
  // Stable identity: the watcher's poll effect depends on it.
  const onSyncCompleted = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads })
    queryClient.invalidateQueries({ queryKey: queryKeys.new })
    queryClient.invalidateQueries({ queryKey: queryKeys.companies })
    queryClient.invalidateQueries({ queryKey: queryKeys.companyAll })
  }, [queryClient])
  const t = useT()
  const [lang, setLang] = useLang()
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  )

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

  // Read-only demo: the first-run dialog never opens, so seed the render lens from the server's
  // own scope (a GET, allowed). The dashboard then opens straight onto Innlandet. Session-only:
  // nothing is written to the visitor's storage that a Settings reset would have to undo.
  useEffect(() => {
    if (!readOnly || focus !== null) return
    let cancelled = false
    queryClient
      .fetchQuery(discoveryQuery())
      .then((config) => {
        if (cancelled) return
        setFocus(toFocusSeed(fromDiscoveryConfig(config), [...KNOWN_CATEGORIES]), {
          persist: false,
        })
      })
      .catch(() => {
        /* no lens: every filter fails open, the demo still shows everything */
      })
    return () => {
      cancelled = true
    }
  }, [readOnly, focus, setFocus, queryClient])

  // FirstRunDialog is a native <dialog>. While it's open+modal, everything outside it is
  // inert, so focusing the h1 from onSave/onDismiss while the dialog is still open is a no-op.
  // Instead watch the dialog-open boolean's true->false transition: child effects run before
  // parent effects, so FirstRunDialog has already called dialog.close() by the time this fires,
  // for both the Start (onSave) and Esc (onDismiss) paths alike.
  useEffect(() => {
    if (prevFocusDialogOpen.current && !focusDialogOpen) h1Ref.current?.focus()
    prevFocusDialogOpen.current = focusDialogOpen
  }, [focusDialogOpen])

  return (
    <ShellContext.Provider value={{ requestCoverage: () => setFocusPromptDismissed(false) }}>
      <ReturnFocusProvider>
        <LiveRegionProvider>
          <SyncWatcherProvider onSyncCompleted={onSyncCompleted}>
            <div className="flex min-h-dvh flex-col">
              <header className="border-b border-border font-sans">
                {/* Phones: brand and the two toggles share the first row and the nav takes a full
              row under them; the controls wrapper dissolves (contents) so flex order can seat
              the toggles beside the brand while the DOM keeps nav before toggles for tab order. */}
                <div className="mx-auto flex max-w-sheet flex-wrap items-center gap-x-3 px-4.5 pt-2.5 pb-1.5 md:h-16 md:flex-nowrap md:gap-x-10 md:px-12 md:py-0">
                  {/* The same navigation as the «Dashbord» nav item (spec v3.8 B1), so it carries
                the dashboard's last search too. Its name starts with the visible word, so
                speech input ("click Hugin") still finds it. */}
                  <Link
                    to="/"
                    search={searchFor('/')}
                    aria-label={t('brand.homeLabel')}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg text-lg font-bold text-foreground no-underline"
                  >
                    {/* Primary variant: the topbar mark renders at 2rem (32 px), the brand
                  pack's minimum for the primary mark. Below that, use micro. */}
                    <HuginMark variant="primary" className="size-8" />
                    Hugin
                  </Link>
                  <div className="contents md:flex md:flex-1 md:items-center md:gap-10">
                    <nav
                      aria-label={t('nav.ariaLabel')}
                      className="order-3 -mx-3 basis-full overflow-x-auto md:order-none md:mx-0 md:flex-1 md:basis-auto"
                    >
                      <ul className="flex list-none gap-1 ps-0">
                        {NAV.map((item) => (
                          <li key={item.to}>
                            <Link
                              to={item.to}
                              params={'params' in item ? item.params : {}}
                              search={searchFor(item.to)}
                              // 44 px tall: the touch-target floor (a11y spec).
                              className="inline-flex min-h-11 items-center rounded-lg px-3 whitespace-nowrap text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
                              // Search params (the dashboard's ?show=all) don't change which page this is.
                              activeOptions={{ exact: item.exact, includeSearch: false }}
                              activeProps={{
                                'aria-current': 'page',
                                className: 'bg-muted font-medium text-foreground',
                              }}
                            >
                              {t(item.labelKey)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </nav>
                    {/* Both quick toggles are icons. The theme glyph shows what it switches TO (the
                  sun in dark mode); the globe cannot, so its label doubles as a tooltip.
                  Settings has no copy of either (v3.6.1). */}
                    <div className="order-2 ml-auto flex gap-0.5 text-muted-foreground md:order-none md:ml-0">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11"
                        onClick={() => setLang(lang === 'nb' ? 'en' : 'nb')}
                        aria-label={lang === 'nb' ? t('lang.switchToEn') : t('lang.switchToNb')}
                        title={lang === 'nb' ? t('lang.switchToEn') : t('lang.switchToNb')}
                      >
                        <Globe aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11"
                        onClick={toggleTheme}
                        aria-label={
                          theme === 'dark' ? t('theme.toggleToLight') : t('theme.toggleToDark')
                        }
                      >
                        {theme === 'dark' ? (
                          <Sun aria-hidden="true" />
                        ) : (
                          <Moon aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </header>
              {readOnly && (
                <section aria-label={t('demo.regionLabel')} className="font-sans">
                  <p className="mx-auto max-w-sheet px-4.5 py-2.5 text-small text-muted-foreground md:px-12">
                    {t('demo.banner')}{' '}
                    <a
                      href={REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline decoration-input underline-offset-3 hover:decoration-current"
                    >
                      {t('demo.repoLink')}
                    </a>
                  </p>
                </section>
              )}
              <main className="mx-auto w-full max-w-sheet flex-1 px-4.5 md:px-12 main-content stack stack-lg">
                <h1 ref={h1Ref} tabIndex={-1} className="sr-only">
                  Hugin
                </h1>
                <Outlet />
              </main>
              <AppFooter />
            </div>
            <FirstRunDialog
              open={focusDialogOpen}
              onSaveFocus={(f, options) => setFocus(f, options)}
              onDone={() => {
                setFirstRunDone(true)
                // The scope was just written server-side: flip the live value now rather than
                // waiting for a reload to re-fetch /api/status, or `scopeConfigured === false` (still
                // the boot-time snapshot) would keep this same condition true and reopen the dialog
                // right after it closes (Task 11 finding 1).
                markScopeConfigured()
              }}
              onDismiss={() => {
                setFocusPromptDismissed(true)
                // Fire and forget: a failed release only means the held boot sync waits for the next launch.
                dismissFirstRun.mutate()
              }}
            />
          </SyncWatcherProvider>
        </LiveRegionProvider>
      </ReturnFocusProvider>
    </ShellContext.Provider>
  )
}
