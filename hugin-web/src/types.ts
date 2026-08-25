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
