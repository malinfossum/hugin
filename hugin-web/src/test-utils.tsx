import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { vi } from 'vitest'
import { dateOfDay, dayNumber } from './lib/dates'
import { makeQueryClient } from './lib/queryClient'

/** Gives a test its own QueryClient (own cache), like App does, so no cached data leaks
 * between tests. */
export function TestQueryProvider({
  children,
  client: given,
}: {
  children: ReactNode
  /** Pass one to reach the cache from the test (e.g. to invalidate a key). */
  client?: QueryClient
}) {
  const [own] = useState(makeQueryClient)
  return <QueryClientProvider client={given ?? own}>{children}</QueryClientProvider>
}

const RoutedContent = createContext<ReactNode>(null)

function RoutedRoot() {
  return (
    <>
      {useContext(RoutedContent)}
      <Outlet />
    </>
  )
}

/** Renders `children` inside a small router on a memory history, so a component with router
 * links can be tested without the whole app. It knows the dashboard and the companies route, the
 * targets of the app's in-view links. Children pass through context, so a re-render reaches
 * them. Router rendering is async: query with `findBy*` first. */
export function TestRouter({
  children,
  initialPath = '/',
}: {
  children: ReactNode
  initialPath?: string
}) {
  const [router] = useState(() => {
    const rootRoute = createRootRoute({ component: RoutedRoot })
    const routeTree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/companies/{-$orgnr}' }),
    ])
    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    })
  })
  return (
    <RoutedContent.Provider value={children}>
      <RouterProvider router={router} />
    </RoutedContent.Provider>
  )
}

/** Where a toast lands: the Base UI viewport the Toaster portals to the end of <body>. The
 * LiveRegionProvider's own region stays the first [aria-live="polite"] in the document. */
export const toastRegion = () => document.querySelector('[data-slot="toast-viewport"]')

/** 11:00 UTC on the Norwegian day this test file loaded: noon in winter, 13:00 in summer. */
const PINNED_NOON = new Date(dateOfDay(dayNumber(new Date())).getTime() + 11 * 3_600_000)

/** Starts the clock at PINNED_NOON and lets it run from there. A suite that
 * counts days from fristIn calls this in beforeEach, so a run that crosses midnight still counts
 * from the day its fixtures were built. Only Date is faked: timers and React Query run as normal.
 * Undo with vi.useRealTimers(). */
export function pinToday() {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
  vi.setSystemTime(PINNED_NOON)
}

/** A frist `days` Norwegian days from today, at noon UTC (the same date in Norway), so a test's
 * frist and its days left agree whenever the suite runs. */
export function fristIn(days: number): string {
  const date = dateOfDay(dayNumber(new Date()) + days)
    .toISOString()
    .slice(0, 10)
  return `${date}T12:00:00Z`
}
