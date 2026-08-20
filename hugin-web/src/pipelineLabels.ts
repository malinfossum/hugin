import type { T } from './i18n'
import type { PipelineStatusSlug } from './types'

/** Localized label for a pipeline status slug — a function of the current language rather
 * than a fixed table, since the display text (Aktiv/Søkt/Svar ↔ Active/Applied/Answered)
 * changes with the language toggle. */
export function pipelineLabel(t: T, status: PipelineStatusSlug): string {
  switch (status) {
    case 'active':
      return t('status.active')
    case 'applied':
      return t('status.applied')
    case 'answered':
      return t('status.answered')
  }
}
