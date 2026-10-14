import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { makeQueryClient } from './lib/queryClient'

/** Gives a test its own QueryClient (own cache), like App does — so no cached data leaks
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
