import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { api } from './api'
import type { StatusDto } from './types'

interface ReadOnlyState {
  /** true only on the hosted demo (server `--public`). */
  readOnly: boolean
  /** false until /api/status has answered — the first-run dialog must not render before then. */
  resolved: boolean
  /** Mirrors StatusDto.scopeConfigured (v3.5 Part A3) — null until resolved, and otherwise
   * whatever the server sent (including undefined, if it omitted the field). App.tsx reads this
   * to reopen the first-run dialog on a server with no scope, reusing this one boot-time fetch
   * rather than adding a second poll.
   *
   * This is a live value, not a frozen boot-time snapshot: completing the first-run dialog or
   * saving a scope from Settings calls `markScopeConfigured()` below to flip it to true
   * immediately, rather than waiting for a page reload to re-fetch /api/status (Task 11
   * finding 1 — without this, the dialog that exists to ask for a scope could never close once
   * it had opened for that reason). */
  scopeConfigured: StatusDto['scopeConfigured'] | null
  /** Flips scopeConfigured to true in local state, without waiting on another /api/status
   * round-trip. Call this the moment a scope is actually written — first-run's Start, and a
   * Settings coverage save. */
  markScopeConfigured: () => void
}

const noop = () => {}

const ReadOnlyContext = createContext<ReadOnlyState>({
  readOnly: false,
  resolved: false,
  scopeConfigured: null,
  markScopeConfigured: noop,
})

/** One status fetch at boot decides the whole session's mode. A failed fetch leaves the app
 * unresolved: views still render (each has its own error state), but nothing that could write
 * on the user's behalf — the first-run dialog above all — opens on a guess. A reload retries. */
export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<ReadOnlyState, 'markScopeConfigured'>>({
    readOnly: false,
    resolved: false,
    scopeConfigured: null,
  })

  useEffect(() => {
    let cancelled = false
    api
      .get<StatusDto>('/api/status')
      .then((status) => {
        if (!cancelled) {
          setState({
            readOnly: status.readOnly,
            resolved: true,
            scopeConfigured: status.scopeConfigured,
          })
        }
      })
      .catch(() => {
        /* stays unresolved */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const markScopeConfigured = () => {
    setState((prev) => (prev.scopeConfigured === true ? prev : { ...prev, scopeConfigured: true }))
  }

  return (
    <ReadOnlyContext.Provider value={{ ...state, markScopeConfigured }}>
      {children}
    </ReadOnlyContext.Provider>
  )
}

export function useReadOnly(): ReadOnlyState {
  return useContext(ReadOnlyContext)
}
