import { useState } from 'react'
import { FristerList } from './FristerList'
import { NyttSidenSist } from './NyttSidenSist'
import { SyncHeader } from './SyncHeader'
import { TrengerHandling } from './TrengerHandling'

export function DashboardView() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="dashboard stack stack-lg">
      <SyncHeader onSyncCompleted={() => setRefreshKey((k) => k + 1)} />
      <TrengerHandling refreshKey={refreshKey} />
      <FristerList refreshKey={refreshKey} />
      <NyttSidenSist refreshKey={refreshKey} />
    </div>
  )
}
