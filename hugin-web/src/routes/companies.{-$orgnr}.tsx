import { createFileRoute } from '@tanstack/react-router'
import { type CompaniesFilters, CompaniesView } from '../views/CompaniesView'

/** One route for the list (`/companies`) and a company's detail (`/companies/<orgnr>`), so the
 * view keeps its identity — and with it the list's focus restoration — when a company opens. */
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
  return (
    <CompaniesView
      selectedOrgnr={orgnr ?? null}
      filters={filters}
      // Typing in the search box would otherwise add a history entry per keystroke.
      onFiltersChange={(patch) =>
        navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })
      }
      onOpenCompany={(next) => navigate({ params: { orgnr: next }, search: (prev) => prev })}
      onCloseCompany={() => navigate({ params: { orgnr: undefined }, search: (prev) => prev })}
      onOpenSettings={() => navigate({ to: '/settings' })}
    />
  )
}
