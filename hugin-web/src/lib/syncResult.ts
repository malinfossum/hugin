import type { T } from '../i18n'
import type { SourceResultDto, SyncRunStatus } from './types'

/** null when no source failed; otherwise the message shared by the announce and the banner. */
export function getFailureMessage(sync: SyncRunStatus, t: T): string | null {
  const failed = [sync.brreg, sync.nav].filter((r): r is SourceResultDto => !!r && !r.succeeded)
  if (failed.length === 0) return null
  if (failed.length === 2) return t('sync.failedFull', { error: failed[0]?.error ?? '' })
  return t('sync.failedPartial', { error: failed[0]?.error ?? '' })
}

// Exact prefix `SyncBrregAsync` returns when no municipalities, fylker or allOfNorway are
// configured (v3.5 Part A2) — an empty result, not an error, so it gets its own prompt instead
// of the generic failure banner (Part A4).
const NO_COVERAGE_PREFIX = 'Ingen dekning valgt'

export function isNoCoverageFailure(sync: SyncRunStatus): boolean {
  return (
    !!sync.brreg && !sync.brreg.succeeded && (sync.brreg.error ?? '').startsWith(NO_COVERAGE_PREFIX)
  )
}
