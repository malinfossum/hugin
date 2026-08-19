import { useState } from 'react'
import { SyncHeader } from './SyncHeader'

export function DashboardView() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    // data-refresh-key: Tasks 13-14 pass refreshKey to the real sections below and
    // list it in their fetch effect deps, so a completed sync refetches them.
    <div className="dashboard" data-refresh-key={refreshKey}>
      <SyncHeader onSyncCompleted={() => setRefreshKey((k) => k + 1)} />
      <section aria-labelledby="trenger-heading">
        <h2 id="trenger-heading">Trenger handling</h2>
        <p>Kommer.</p>
      </section>
      <section aria-labelledby="frister-heading">
        <h2 id="frister-heading">Frister</h2>
        <p>Kommer.</p>
      </section>
      <section aria-labelledby="nytt-heading">
        <h2 id="nytt-heading">Nytt siden sist</h2>
        <p>Kommer.</p>
      </section>
    </div>
  )
}
