// Mirrors of the C# DTOs, as serialized (camelCase).

export type PipelineStatusSlug = 'active' | 'applied' | 'answered'

export interface AdDto {
  feedId: string
  title: string
  employer: string | null
  employerOrgnr: string | null
  kommune: string | null
  expires: string | null
  daysLeft: number | null
  category: string | null
  sourceUrl: string | null
  pipelineStatus: PipelineStatusSlug | null
  hidden: boolean
  isActive: boolean
  published: string | null
  /** Manual link to the pipeline entry the ad belongs to (sister-company case); wins over the
   * automatic orgnr / registry-root match. */
  linkedOrgnr: string | null
}

export interface CompanyDto {
  orgnr: string
  name: string
  kommune: string | null
  kommuneNavn: string | null
  naceCode: string | null
  isBranch: boolean
  website: string | null
  parentOrgnr: string | null
}

export interface CompanyDetailDto {
  company: CompanyDto
  ads: AdDto[]
  branches: CompanyDto[]
}

export interface NewDto {
  companies: CompanyDto[]
  ads: AdDto[]
  since: string
  asOf: string
}

export interface PipelineDto {
  orgnr: string
  companyName: string
  status: PipelineStatusSlug
  starred: boolean
  why: string
  note: string | null
  svar: string | null
  updated: string
  /** Derived server-side: the entry has ads and none is still open. Never a stored status. */
  adsExpired: boolean
}

export interface TrackResponse {
  entry: PipelineDto
  warning: string | null
}

export interface SourceStateDto {
  lastSyncUtc: string
}

export interface SourceDto {
  id: number
  label: string
  url: string
  position: number
}

export interface StatusDto {
  brreg: SourceStateDto | null
  nav: SourceStateDto | null
  reviewMark: string | null
  activeAds: number
  companies: number
  pipelineEntries: number
  readOnly: boolean
  /** True when municipalities, fylker or allOfNorway is non-empty — false on a fresh install
   * with no scope chosen yet (v3.5 Part A3). Optional, not `| null`: an older or degraded
   * response can omit the field entirely rather than sending it as an explicit null (Task 11
   * finding 5) — readOnly.tsx's state mirrors that same absence rather than papering over it. */
  scopeConfigured?: boolean
}

export interface SourceResultDto {
  succeeded: boolean
  fetched: number
  error: string | null
}

export interface SyncRunStatus {
  running: boolean
  startedUtc: string | null
  finishedUtc: string | null
  brreg: SourceResultDto | null
  nav: SourceResultDto | null
}

export interface KommuneDto {
  number: string
  name: string
}

export interface MunicipalityRefDto {
  name: string
  number: string
}

export interface DiscoveryConfigDto {
  municipalities: MunicipalityRefDto[]
  fylker: string[]
  allOfNorway: boolean
}

export interface DiscoveryWriteRequest {
  municipalityNumbers: string[]
  fylker: string[]
  allOfNorway: boolean
}

export interface FocusConfigDto {
  naeringskoder: string[]
  keywords: string[]
}

export interface NacePreviewDto {
  code: string
  name: string | null
  units: number
}

export interface ResetResultDto {
  mode: 'scope' | 'all'
  /** Only set for mode "all" — the VACUUM INTO snapshot taken before the wipe. */
  snapshotPath: string | null
}
