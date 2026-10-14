import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/** One router per App instance (like its QueryClient), so tests start from a clean state. Pass a
 * memory history to run without a browser URL. The route tree is generated from src/routes by
 * the router plugin (vite.config.ts). */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    history: options.history,
    // Restores each page's scroll position, replacing the hand-kept map.
    scrollRestoration: true,
    // Keyed per path, not per history entry (the default), so a page reached again through the
    // nav returns to where it was left, not only one reached by Back/Forward. The company list
    // and a company's detail have different paths, so each keeps its own position. Search params
    // are left out: typing a filter on the list doesn't make it a different page. The position
    // is restored right after the view renders, so a view whose data is still loading (its cache
    // entry was garbage-collected) is too short to scroll and lands at the top instead.
    getScrollRestorationKey: (location) => location.pathname,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
