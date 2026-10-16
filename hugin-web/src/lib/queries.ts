import { queryOptions } from '@tanstack/react-query'
import { api } from './api'
import type {
  AdDto,
  CompanyDetailDto,
  CompanyDto,
  DiscoveryConfigDto,
  FocusConfigDto,
  KommuneDto,
  NewDto,
  PipelineDto,
  SourceDto,
  StatusDto,
  SyncRunStatus,
} from './types'

export const queryKeys = {
  sources: ['sources'] as const,
  status: ['status'] as const,
  syncStatus: ['sync-status'] as const,
  /** Prefix of every ads list (visible and hidden-included). Invalidate this one. */
  ads: ['ads'] as const,
  adsList: (includeHidden: boolean) => ['ads', { includeHidden }] as const,
  new: ['new'] as const,
  pipeline: ['pipeline'] as const,
  companies: ['companies'] as const,
  kommuner: ['kommuner'] as const,
  discovery: ['discovery'] as const,
  focusConfig: ['focus-config'] as const,
  recommendedCodes: ['recommended-codes'] as const,
  /** Prefix of every company detail: invalidate this one. */
  companyAll: ['company'] as const,
  company: (orgnr: string) => ['company', orgnr] as const,
}

export const sourcesQuery = () =>
  queryOptions({ queryKey: queryKeys.sources, queryFn: () => api.get<SourceDto[]>('/api/sources') })

export const statusQuery = () =>
  queryOptions({ queryKey: queryKeys.status, queryFn: () => api.get<StatusDto>('/api/status') })

/** A visited company unit (root or branch tab) isn't refetched while the user flips between tabs;
 * a minute is long enough for that and short enough that reopening it later shows fresh data. */
export const companyQuery = (orgnr: string) =>
  queryOptions({
    queryKey: queryKeys.company(orgnr),
    queryFn: () => api.get<CompanyDetailDto>(`/api/companies/${orgnr}`),
    staleTime: 60_000,
  })

export const adsQuery = (includeHidden = false) =>
  queryOptions({
    queryKey: queryKeys.adsList(includeHidden),
    queryFn: () => api.get<AdDto[]>(includeHidden ? '/api/ads?hidden=true' : '/api/ads'),
  })

/** `/api/new` answers with nothing before the first sync; a query can't resolve to undefined, so
 * that case becomes null. */
export const newQuery = () =>
  queryOptions({
    queryKey: queryKeys.new,
    queryFn: async () => (await api.get<NewDto | undefined>('/api/new')) ?? null,
  })

export const pipelineQuery = () =>
  queryOptions({
    queryKey: queryKeys.pipeline,
    queryFn: () => api.get<PipelineDto[]>('/api/pipeline'),
  })

/** The server's recommended NACE codes: a fixed list, so fetched once per session. */
export const recommendedCodesQuery = () =>
  queryOptions({
    queryKey: queryKeys.recommendedCodes,
    queryFn: () => api.get<string[]>('/api/config/focus/recommended'),
    staleTime: Number.POSITIVE_INFINITY,
  })

/** The running sync's progress, polled every 2s. Polling never stops (not even in a background
 * tab or after a sync completes): a later "Synk nå" is picked up by the next tick, and a running
 * sync must finish its announce/refresh cycle whichever view is showing. That is why its observer
 * (SyncWatcherProvider) lives in the shell, not the dashboard. A failed poll keeps the
 * previous data and the next tick tries again. */
export const syncStatusQuery = () =>
  queryOptions({
    queryKey: queryKeys.syncStatus,
    queryFn: () => api.get<SyncRunStatus>('/api/sync/status'),
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
  })

export const companiesQuery = () =>
  queryOptions({
    queryKey: queryKeys.companies,
    queryFn: () => api.get<CompanyDto[]>('/api/companies'),
  })

/** The kommune register: fixed for the life of the server, so fetched once per session. */
export const kommunerQuery = () =>
  queryOptions({
    queryKey: queryKeys.kommuner,
    queryFn: () => api.get<KommuneDto[]>('/api/kommuner'),
    staleTime: Number.POSITIVE_INFINITY,
  })

/** The server's discovery scope (what sync fetches). Invalidate after anything that writes it. */
export const discoveryQuery = () =>
  queryOptions({
    queryKey: queryKeys.discovery,
    queryFn: () => api.get<DiscoveryConfigDto>('/api/config/discovery'),
  })

export const focusConfigQuery = () =>
  queryOptions({
    queryKey: queryKeys.focusConfig,
    queryFn: () => api.get<FocusConfigDto>('/api/config/focus'),
  })
