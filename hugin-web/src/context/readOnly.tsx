import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { statusQuery } from '../lib/queries'
import type { StatusDto } from '../lib/types'

interface ReadOnlyState {
  /** true only on the hosted demo (server `--public`). */
  readOnly: boolean
  /** false until /api/status has answered. The first-run dialog must not render before then. */
  resolved: boolean
  /** Mirrors StatusDto.scopeConfigured (v3.5 Part A3). It is null until resolved, and otherwise
   * whatever the server sent (including undefined, if it omitted the field). App.tsx reads this
   * to reopen the first-run dialog on a server with no scope, reusing this one boot-time fetch
   * rather than adding a second poll.
   *
   * This is a live value, not a frozen boot-time snapshot: completing the first-run dialog or
   * saving a scope from Settings calls `markScopeConfigured()` below to flip it to true
   * immediately, rather than waiting for a page reload to re-fetch /api/status (Task 11
   * finding 1: without this, the dialog that exists to ask for a scope could never close once
   * it had opened for that reason). */
  scopeConfigured: StatusDto['scopeConfigured'] | null
  /** Flips scopeConfigured to true in local state, without waiting on another /api/status
   * round-trip. Call this the moment a scope is actually written: first-run's Start, and a
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
 * on the user's behalf (the first-run dialog above all) opens on a guess. A reload retries. */
export function ReadOnlyProvider({ children }: { children: ReactNode }) {
  // The same `status` query SyncHeader reads, so boot is one request and a status refresh after
  // a sync reaches both. A failed fetch leaves `data` undefined: unresolved.
  const { data: status } = useQuery(statusQuery())
  const [scopeMarked, setScopeMarked] = useState(false)

  const markScopeConfigured = () => setScopeMarked(true)

  const state = {
    readOnly: status?.readOnly ?? false,
    resolved: status !== undefined,
    scopeConfigured: scopeMarked ? true : status ? status.scopeConfigured : null,
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
