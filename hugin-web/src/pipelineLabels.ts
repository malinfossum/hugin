import type { PipelineStatusSlug } from './types'

export const PIPELINE_LABELS: Record<PipelineStatusSlug, string> = {
  funnet: 'Funnet',
  'soekt-selv': 'Søkt selv',
  'bedt-get': 'Bedt GET sjekke',
  svar: 'Svar',
}
