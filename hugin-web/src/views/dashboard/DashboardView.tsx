import { useState } from 'react'
import { FristerList } from './FristerList'
import { NyttSidenSist } from './NyttSidenSist'
import { SourcesCard } from './SourcesCard'
import { SyncHeader } from './SyncHeader'
import { TrengerHandling } from './TrengerHandling'

export function DashboardView({ sourcesVersion }: { sourcesVersion: number }) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="dashboard stack stack-lg">
      <SyncHeader onSyncCompleted={() => setRefreshKey((k) => k + 1)} />
      <SourcesCard refreshToken={sourcesVersion} />
      <TrengerHandling refreshKey={refreshKey} />
      <FristerList refreshKey={refreshKey} />
      <NyttSidenSist refreshKey={refreshKey} />
    </div>
  )
}
