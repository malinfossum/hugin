import { QueryClient } from '@tanstack/react-query'

/** Defaults chosen to match how the app fetched before TanStack Query: no automatic retries (a
 * failed load shows its error state straight away, with a manual Retry) and no refetch on window
 * focus. Data is refreshed explicitly via invalidation after mutations. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
}
