import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react'
import { useT } from '../i18n'
import { queryKeys, syncStatusQuery } from '../lib/queries'
import { getFailureMessage, isNoCoverageFailure } from '../lib/syncResult'
import { toast } from './ui/toast'

interface SyncWatcherActions {
  /** Called once a POST /api/sync has been accepted (or answered 409), so a sync that starts and
   * finishes between two polls is still announced. */
  markSyncStarted: () => void
}

const SyncWatcherContext = createContext<SyncWatcherActions>({ markSyncStarted: () => {} })

export function useSyncWatcher(): SyncWatcherActions {
  return useContext(SyncWatcherContext)
}

interface SyncWatcherProviderProps {
  /** Runs once per finished sync, after the toast. */
  onSyncCompleted: () => void
  children: ReactNode
}

/** Owns the sync-status poll and its completion cycle (toast, refresh). Mounted by the shell,
 * not the dashboard, so a sync started there still finishes its cycle while another view shows. */
export function SyncWatcherProvider({ onSyncCompleted, children }: SyncWatcherProviderProps) {
  const queryClient = useQueryClient()
  const { data: sync = null, dataUpdatedAt } = useQuery(syncStatusQuery())
  const t = useT()
  const wasRunning = useRef(false)
  const handledPoll = useRef(0)

  // Completion is detected on each poll that answers (dataUpdatedAt moves even when the payload
  // is identical to the last one: a sync that started and finished between two ticks looks the
  // same as the idle status before it). See syncStatusQuery for why polling never stops.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt is the new-poll signal
  useEffect(() => {
    // Each poll result is handled once, even if a dependency below changes identity meanwhile.
    if (!sync || handledPoll.current === dataUpdatedAt) return
    handledPoll.current = dataUpdatedAt
    if (wasRunning.current && !sync.running) {
      wasRunning.current = false
      const failure = getFailureMessage(sync, t)
      if (isNoCoverageFailure(sync))
        toast.add({ type: 'warning', title: t('dashboard.noCoverageAnnounce') })
      else if (failure) toast.add({ type: 'error', title: failure, priority: 'high' })
      else toast.add({ type: 'success', title: t('sync.done') })
      queryClient.invalidateQueries({ queryKey: queryKeys.status })
      onSyncCompleted()
    }
    if (sync.running) wasRunning.current = true
  }, [dataUpdatedAt, queryClient, onSyncCompleted, t])

  return (
    <SyncWatcherContext.Provider
      value={{
        markSyncStarted: () => {
          wasRunning.current = true
        },
      }}
    >
      {children}
    </SyncWatcherContext.Provider>
  )
}
