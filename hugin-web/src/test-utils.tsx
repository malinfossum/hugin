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
