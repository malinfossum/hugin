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

/** Below md, today's line and the seen line run through each lifeline's own box, so a label they
 * can cross sits on a chip of the surface colour and the line stops behind the text. A ring, not
 * padding, so the text stays where it was. From md the shared overlay draws the marks and the
 * label is left bare: a chip there would cut a box out of the seen wash. Full class strings, so
 * Tailwind finds them. */
export const PHONE_LABEL_CHIP = {
  // The dashboard rows light up (hover, data-lit), so the chip follows the row.
  page: 'z-10 rounded-xs bg-background ring-3 ring-background group-hover:bg-muted group-hover:ring-muted group-data-lit:bg-muted group-data-lit:ring-muted md:z-auto md:bg-transparent md:ring-0 md:group-hover:bg-transparent md:group-data-lit:bg-transparent',
  popover: 'z-10 rounded-xs bg-popover ring-3 ring-popover md:z-auto md:bg-transparent md:ring-0',
} as const

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
