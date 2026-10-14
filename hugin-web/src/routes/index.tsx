import { createFileRoute } from '@tanstack/react-router'
import { useShell } from '../AppShell'
import { DashboardView } from '../views/dashboard/DashboardView'

// Search params carry the state a view should keep across navigation and in a shared link. Each
// validateSearch narrows whatever the URL holds to the shape the view expects and drops the rest,
// so a hand-edited or stale URL degrades to the default instead of reaching the view as junk.
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { show?: 'all' } =>
    search.show === 'all' ? { show: 'all' } : {},
  component: DashboardRoute,
})

function DashboardRoute() {
  const { requestCoverage } = useShell()
  const { show = 'active' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DashboardView
      show={show}
      onShowChange={(next) =>
        navigate({ search: next === 'all' ? { show: 'all' } : {}, replace: true })
      }
      onRequestCoverage={requestCoverage}
    />
  )
}
