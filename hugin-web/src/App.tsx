import { useState } from 'react'
import { LiveRegionProvider } from './components/LiveRegion'
import { BedrifterView } from './views/BedrifterView'
import { DashboardView } from './views/dashboard/DashboardView'
import { EksportView } from './views/EksportView'
import { PipelineView } from './views/PipelineView'
import './styles/main.css'

const VIEWS = ['Dashbord', 'Pipeline', 'Bedrifter', 'Eksport'] as const
export type ViewName = (typeof VIEWS)[number]

export default function App() {
  const [view, setView] = useState<ViewName>('Dashbord')

  return (
    <LiveRegionProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="container cluster-between">
            <span className="brand">Hugin</span>
            <nav aria-label="Hovedmeny">
              <ul className="nav-list">
                {VIEWS.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="nav-link"
                      onClick={() => setView(name)}
                      aria-current={view === name ? 'page' : undefined}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>
        <main className="container main-content stack stack-lg">
          <h1 className="visually-hidden">Hugin</h1>
          {view === 'Dashbord' && <DashboardView />}
          {view === 'Pipeline' && <PipelineView />}
          {view === 'Bedrifter' && <BedrifterView />}
          {view === 'Eksport' && <EksportView />}
        </main>
      </div>
    </LiveRegionProvider>
  )
}
