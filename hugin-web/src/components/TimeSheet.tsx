// The pieces both time sheets draw alike (DESIGN.md, the Lifeline rule): the deadlines on the
// dashboard and a company's ad history. Every position is a percentage of the sheet's scale.
import { cn } from '@/lib/utils'
import { type LifelineTone, pct } from '../lib/lifeline'

/** One band of the scale bar, a whole week or month; the bands alternate filled and open. */
export function ScaleBand({ x, width, filled }: { x: number; width: number; filled: boolean }) {
  return (
    <span
      className={cn(
        'span-x absolute bottom-5.5 h-1 border border-muted-foreground dark:border-ink-tertiary',
        filled && 'bg-muted-foreground dark:bg-ink-tertiary'
      )}
      style={{ '--x': pct(x), '--w': pct(width) }}
    />
  )
}

/** A lifeline's future, from today to its frist, and the tick at the frist. Closing is heavier as
 * well as rust: rust and contour are too close in lightness to tell apart by colour alone. */
export function LifelineFuture({
  from,
  to,
  tone,
}: {
  from: number
  to: number
  tone: LifelineTone
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'span-x absolute top-1/2 -translate-y-1/2',
          tone === 'closing' && 'border-t-3 border-rust',
          tone === 'applied' && 'border-t-2 border-lake',
          tone === 'open' && 'border-t-2 border-contour'
        )}
        style={{ '--x': pct(from), '--w': pct(to - from) }}
      />
      <span
        aria-hidden="true"
        className={cn(
          'at-x absolute top-1/2 h-3 w-0.5 -translate-1/2',
          tone === 'closing' && 'w-0.75 bg-rust',
          tone === 'applied' && 'bg-lake',
          tone === 'open' && 'bg-contour'
        )}
        style={{ '--x': pct(to) }}
      />
    </>
  )
}

/** Today's line on one lifeline. Phones have no shared overlay, so each line carries its own. */
export function PhoneTodayLine({ x }: { x: number }) {
  return (
    <span
      aria-hidden="true"
      className="at-x absolute inset-y-2 border-l border-foreground md:hidden"
      style={{ '--x': pct(x) }}
    />
  )
}
