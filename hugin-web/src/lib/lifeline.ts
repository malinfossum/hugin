// What a lifeline says about an ad (DESIGN.md, the Lifeline rule), shared by every view that
// draws one: its future's colour, and the days-left figure beside its frist.
import type { T } from '../i18n'
import type { AdDto } from './types'

/** Rust's one job (DESIGN.md): closing within 7 days, today and already past included. */
export function isClosing(daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft <= 7
}

export type LifelineTone = 'closing' | 'applied' | 'open'

/** Which colour a lifeline's future carries. Closing beats applied (DESIGN.md, Lifeline rule). */
export function lifelineTone(ad: AdDto): LifelineTone {
  if (isClosing(ad.daysLeft)) return 'closing'
  return ad.pipelineStatus === 'applied' ? 'applied' : 'open'
}

export function daysLeftText(daysLeft: number | null, t: T): string {
  if (daysLeft === null) return t('deadlines.none')
  if (daysLeft < 0) return t('deadlines.expiredBadge')
  if (daysLeft === 0) return t('deadlines.todayBadge')
  if (daysLeft === 1) return t('deadlines.dayBadgeOne')
  return t('deadlines.daysBadge', { n: daysLeft })
}

/** A deadline row's id, so the needs-action sentence can jump to it. */
export const deadlineRowId = (feedId: string) => `deadline-${feedId}`

/** Whether a label at scale position `x` turns to sit left of its point, so it stays on the sheet. */
export const labelFlips = (x: number, narrow: boolean) => x > (narrow ? 60 : 84)

/** A scale position for the at-x / span-x utilities (index.css), as a CSS percentage. */
export const pct = (n: number) => `${n}%`
