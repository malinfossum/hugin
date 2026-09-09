import { useState } from 'react'
import { FristerList } from './FristerList'
import { NyttSidenSist } from './NyttSidenSist'
import { SourcesCard } from './SourcesCard'
import { SyncHeader } from './SyncHeader'
import { TrengerHandling } from './TrengerHandling'

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
      <SourcesCard refreshToken={sourcesVersion} />
      <TrengerHandling refreshKey={refreshKey} />
      <FristerList refreshKey={refreshKey} />
      <NyttSidenSist refreshKey={refreshKey} />
    </div>
  )
}
