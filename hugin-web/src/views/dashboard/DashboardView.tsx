import { useState } from 'react'
import { FristerList } from './FristerList'
import { SyncHeader } from './SyncHeader'
import { TrengerHandling } from './TrengerHandling'

export function DashboardView() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    // data-refresh-key: Task 14 passes refreshKey to Nytt siden sist below and lists
    // it in its fetch effect deps, so a completed sync refetches it.
    <div className="dashboard" data-refresh-key={refreshKey}>
      <SyncHeader onSyncCompleted={() => setRefreshKey((k) => k + 1)} />
      <TrengerHandling refreshKey={refreshKey} />
      <FristerList refreshKey={refreshKey} />
      <section aria-labelledby="nytt-heading">
        <h2 id="nytt-heading">Nytt siden sist</h2>
        <p>Kommer.</p>
      </section>
    </div>
  )
}
