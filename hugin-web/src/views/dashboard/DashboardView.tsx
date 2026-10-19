import { DeadlineList } from './DeadlineList'
import { NeedsAction } from './NeedsAction'
import { NewSinceLastVisit } from './NewSinceLastVisit'
import { SourcesCard } from './SourcesCard'
import { SyncHeader } from './SyncHeader'

interface DashboardViewProps {
  /** Which ads the deadline list shows. It lives in the URL (`?show=all`) so a reload keeps it. */
  show: 'active' | 'all'
  onShowChange: (show: 'active' | 'all') => void
  /** Reopens the first-run dialog: wired from App.tsx (SyncHeader's empty-coverage prompt). */
  onRequestCoverage: () => void
  /** Opens Settings, offered where the display filter hides every open ad. */
  onOpenSettings?: () => void
}

export function DashboardView({
  show,
  onShowChange,
  onRequestCoverage,
  onOpenSettings,
}: DashboardViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <SyncHeader onRequestCoverage={onRequestCoverage} />
      <NeedsAction />
      <DeadlineList show={show} onShowChange={onShowChange} onOpenSettings={onOpenSettings} />
      <NewSinceLastVisit />
      <SourcesCard />
    </div>
  )
}
