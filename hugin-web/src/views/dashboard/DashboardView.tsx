import { useState } from 'react'
import { DeadlineList } from './DeadlineList'
import { NeedsAction } from './NeedsAction'
import { NewSinceLastVisit } from './NewSinceLastVisit'
import { SourcesCard } from './SourcesCard'
import { SyncHeader } from './SyncHeader'

interface DashboardViewProps {
  sourcesVersion: number
  /** Reopens the first-run dialog — wired from App.tsx (SyncHeader's empty-coverage prompt). */
  onRequestCoverage: () => void
}

export function DashboardView({ sourcesVersion, onRequestCoverage }: DashboardViewProps) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="dashboard stack stack-lg">
      <SyncHeader
        onSyncCompleted={() => setRefreshKey((k) => k + 1)}
        onRequestCoverage={onRequestCoverage}
      />
      <NeedsAction refreshKey={refreshKey} />
      <DeadlineList refreshKey={refreshKey} />
      <NewSinceLastVisit refreshKey={refreshKey} />
      <SourcesCard refreshToken={sourcesVersion} />
    </div>
  )
}
