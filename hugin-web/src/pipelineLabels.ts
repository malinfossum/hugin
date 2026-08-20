import type { PipelineStatusSlug } from './types'

export const PIPELINE_LABELS: Record<PipelineStatusSlug, string> = {
  active: 'Aktiv',
  applied: 'Søkt',
  answered: 'Svar',
}
