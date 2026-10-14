import { DeadlineList } from './DeadlineList'
import { NeedsAction } from './NeedsAction'
import { NewSinceLastVisit } from './NewSinceLastVisit'
import { SourcesCard } from './SourcesCard'
import { SyncHeader } from './SyncHeader'

interface DashboardViewProps {
  /** Which ads the deadline list shows — lives in the URL (`?show=all`) so a reload keeps it. */
  show: 'active' | 'all'
  onShowChange: (show: 'active' | 'all') => void
  /** Reopens the first-run dialog — wired from App.tsx (SyncHeader's empty-coverage prompt). */
  onRequestCoverage: () => void
}

export function DashboardView({ show, onShowChange, onRequestCoverage }: DashboardViewProps) {
  return (
    <div className="dashboard stack stack-lg">
      <SyncHeader onRequestCoverage={onRequestCoverage} />
      <NeedsAction />
      <DeadlineList show={show} onShowChange={onShowChange} />
      <NewSinceLastVisit />
      <SourcesCard />
    </div>
  )
}
