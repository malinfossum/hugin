import { createFileRoute, useCanGoBack, useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { type CompaniesFilters, CompaniesView } from '../views/CompaniesView'

/** One route for the list (`/companies`) and a company's detail (`/companies/<orgnr>`), so the
 * view keeps its identity (and with it the list's focus restoration) when a company opens. */
export const Route = createFileRoute('/companies/{-$orgnr}')({
  validateSearch: (search: Record<string, unknown>): CompaniesFilters => ({
    // The URL parser turns "123" into a number; the filter is always text.
    q: search.q === undefined || search.q === '' ? undefined : String(search.q),
    website: search.website === 'has' || search.website === 'none' ? search.website : undefined,
    ads: search.ads === 'open' ? 'open' : undefined,
  }),
  component: CompaniesRoute,
})

function CompaniesRoute() {
  const { orgnr } = Route.useParams()
  const filters = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  // False on the first entry of a visit (a cold load of a shared /companies/<orgnr>), where Back
  // would leave the app.
  const canGoBack = useCanGoBack()
  // One close per opened company. Enter held down on Tilbake repeats the click before the router
  // has rendered the first Back, and a second Back would go one page too far, out of the app
  // from the first page of a visit.
  const closing = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: orgnr is the signal that a new company opened
  useEffect(() => {
    closing.current = false
  }, [orgnr])
  return (
    <CompaniesView
      selectedOrgnr={orgnr ?? null}
      filters={filters}
      // Typing in the search box would otherwise add a history entry per keystroke.
      onFiltersChange={(patch) =>
        navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
      }
      onOpenCompany={(next) => navigate({ params: { orgnr: next }, search: (prev) => prev })}
      // Closing is the browser's Back when the detail was opened inside the app (spec v3.8 B5):
      // it returns to the page it was opened from, the dashboard or the list, with that page's
      // filters and scroll. A cold load has nothing to go back to, so it opens the list.
      onCloseCompany={() => {
        if (closing.current) return
        closing.current = true
        if (canGoBack) router.history.back()
        else navigate({ params: { orgnr: undefined }, search: (prev) => prev })
      }}
      onOpenSettings={() => navigate({ to: '/settings' })}
    />
  )
}
