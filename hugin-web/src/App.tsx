import { useState } from 'react'
import { LiveRegionProvider } from './components/LiveRegion'
import { DashboardView } from './views/dashboard/DashboardView'
import { PipelineView } from './views/PipelineView'
import './styles/main.css'

const VIEWS = ['Dashbord', 'Pipeline', 'Bedrifter', 'Eksport'] as const
export type ViewName = (typeof VIEWS)[number]

export default function App() {
  const [view, setView] = useState<ViewName>('Dashbord')

  return (
    <LiveRegionProvider>
      <nav aria-label="Hovedmeny">
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setView(name)}
            aria-current={view === name ? 'page' : undefined}
          >
            {name}
          </button>
        ))}
      </nav>
      <main>
        <h1 className="visually-hidden">Hugin</h1>
        {view === 'Dashbord' && <DashboardView />}
        {view === 'Pipeline' && <PipelineView />}
        {view === 'Bedrifter' && <p>Bedrifter kommer.</p>}
        {view === 'Eksport' && <p>Eksport kommer.</p>}
      </main>
    </LiveRegionProvider>
  )
}
