import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { queryKeys } from './queries'
import type { PipelineStatusSlug, TrackResponse } from './types'

/** Every write the app makes, as a mutation hook. Each one invalidates the queries its write
 * changes, and returns that invalidation from onSuccess: the mutation then stays pending until
 * the refetch lands, so a caller awaiting `mutateAsync` sees fresh data when it resumes (to move
 * focus, announce, close a form). */

interface SourceInput {
  label: string
  url: string
}

export function useAddSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (source: SourceInput) => api.post('/api/sources', source),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

export function useUpdateSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...source }: SourceInput & { id: number }) =>
      api.put(`/api/sources/${id}`, source),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

export function useRemoveSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/sources/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

export function useReorderSources() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: number[]) => api.post('/api/sources/reorder', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sources }),
  })
}

interface PipelineInput {
  orgnr: string
  status: PipelineStatusSlug
  why?: string
  note?: string | null
  svar?: string | null
  starred?: boolean
}

/** Tracks a company, or rewrites its pipeline entry. Ads carry their employer's pipeline status
 * and the status counts include the entries, so both refresh along with the pipeline list. */
export function useSavePipelineEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orgnr, ...entry }: PipelineInput) =>
      api.put<TrackResponse>(`/api/pipeline/${orgnr}`, entry),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pipeline }),
        queryClient.invalidateQueries({ queryKey: queryKeys.ads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.status }),
      ]),
  })
}

export function useSetAdHidden() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ feedId, hidden }: { feedId: string; hidden: boolean }) =>
      hidden ? api.post(`/api/ads/${feedId}/hide`) : api.del(`/api/ads/${feedId}/hide`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ads }),
  })
}

/** Links an ad to a tracked company by hand (orgnr), or removes the link (null). A company's
 * detail lists the ads linked to it, so every cached detail refreshes along with the ads. */
export function useSetAdLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ feedId, orgnr }: { feedId: string; orgnr: string | null }) =>
      orgnr === null
        ? api.del(`/api/ads/${feedId}/link`)
        : api.put(`/api/ads/${feedId}/link`, { orgnr }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.ads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.companyAll }),
      ]),
  })
}

export function useMarkSeen() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (asOf: string) => api.post('/api/seen', { asOf }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.new }),
  })
}

/** Starts a sync (`full` = the whole Brreg backfill). A 409 means one is already running.
 * Progress and the refresh afterwards belong to the sync-status poll, so nothing is invalidated. */
export function useStartSync() {
  return useMutation({
    mutationFn: ({ full = false }: { full?: boolean } = {}) =>
      api.post(full ? '/api/sync?full=1' : '/api/sync'),
  })
}

/** Releases a held boot sync on a fresh install; a no-op 204 otherwise. */
export function useDismissFirstRun() {
  return useMutation({ mutationFn: () => api.post('/api/first-run-dismissed') })
}
