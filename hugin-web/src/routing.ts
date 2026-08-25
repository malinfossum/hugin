import type { ViewName } from './App'

export type Route = { view: ViewName; company: string | null }

const VIEW_PATHS: Record<Exclude<ViewName, 'dashboard'>, string> = {
  applications: '/applications',
  companies: '/companies',
  export: '/export',
  settings: '/settings',
}

/** Parses a pathname into a Route. Unknown paths (and '/') fall back to dashboard — matching
 * the app's default view and giving deep-linking a safe landing spot for typos or stale links. */
export function parseRoute(pathname: string): Route {
  if (pathname === '/applications') return { view: 'applications', company: null }
  if (pathname === '/export') return { view: 'export', company: null }
  if (pathname === '/settings') return { view: 'settings', company: null }
  if (pathname === '/companies') return { view: 'companies', company: null }
  const companyMatch = pathname.match(/^\/companies\/(.+)$/)
  if (companyMatch) return { view: 'companies', company: companyMatch[1] }
  return { view: 'dashboard', company: null }
}

/** Formats a Route back into a pathname. A `company` set on any view other than 'companies' is
 * ignored — it shouldn't happen via `navigate`, but routePath stays a pure, total function
 * rather than throwing on a shape it doesn't expect. */
export function routePath(route: Route): string {
  if (route.view === 'dashboard') return '/'
  if (route.view === 'companies') {
    return route.company ? `/companies/${route.company}` : '/companies'
  }
  return VIEW_PATHS[route.view]
}
