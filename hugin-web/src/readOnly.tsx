import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { api } from './api'
import type { StatusDto } from './types'

interface ReadOnlyState {
  /** true only on the hosted demo (server `--public`). */
  readOnly: boolean
  /** false until /api/status has answered — the first-run dialog must not render before then. */
  resolved: boolean
}

const ReadOnlyContext = createContext<ReadOnlyState>({ readOnly: false, resolved: false })

/** One status fetch at boot decides the whole session's mode. A failed fetch leaves the app
 * unresolved: views still render (each has its own error state), but nothing that could write
 * on the user's behalf — the first-run dialog above all — opens on a guess. A reload retries. */
export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReadOnlyState>({ readOnly: false, resolved: false })

  useEffect(() => {
    let cancelled = false
    api
      .get<StatusDto>('/api/status')
      .then((status) => {
        if (!cancelled) setState({ readOnly: status.readOnly, resolved: true })
      })
      .catch(() => {
        /* stays unresolved */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <ReadOnlyContext.Provider value={state}>{children}</ReadOnlyContext.Provider>
}

export function useReadOnly(): ReadOnlyState {
  return useContext(ReadOnlyContext)
}
