import type { ReactNode } from 'react'

interface Props {
  /** The heading's id; the section is labelled by it. */
  headingId: string
  title: string
  hint?: ReactNode
  children: ReactNode
}

/** One Settings section as a sheet row (DESIGN.md): a hairline above (none on the first, which
 * has nothing above it to separate from), the title and its hint in the 360px title column, the
 * controls from the time edge. Stacked on a phone. */
export function SettingsSection({ headingId, title, hint, children }: Props) {
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 border-t border-border py-8 first:border-t-0 first:pt-4 md:flex-row md:gap-0"
    >
      <div className="flex flex-col gap-1 md:w-90 md:shrink-0 md:pe-8">
        <h2 id={headingId} className="font-heading text-xl font-semibold text-foreground">
          {title}
        </h2>
        {hint && <p className="text-body-sm text-pretty text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </section>
  )
}
