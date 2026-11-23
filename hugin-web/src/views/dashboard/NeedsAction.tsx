import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { adMatchesFocus, useFocus } from '../../context/focus'
import { type T, useT } from '../../i18n'
import { displayCompanyName } from '../../lib/companyName'
import { dayOf, formatDate } from '../../lib/dates'
import { daysLeftFrom, deadlineRowId, isClosing } from '../../lib/lifeline'
import { adsQuery } from '../../lib/queries'
import { useToday } from '../../lib/today'
import type { AdDto } from '../../lib/types'

/** One plain sentence per ad: which ad, when it closes, and why it needs action. */
function sentence(ad: AdDto, daysLeft: number, t: T): string {
  const name = ad.employer
    ? t('needsAction.adAt', { title: ad.title, employer: displayCompanyName(ad.employer) })
    : ad.title
  const date =
    dayOf(ad.expires) !== null ? formatDate(ad.expires as string) : t('companies.notGiven')
  const closes =
    daysLeft < 0
      ? t('needsAction.closed', { ad: name, date })
      : daysLeft === 0
        ? t('needsAction.closesToday', { ad: name })
        : daysLeft === 1
          ? t('needsAction.closesInOneDay', { ad: name, date })
          : t('needsAction.closesInDays', { ad: name, date, n: daysLeft })
  return `${closes} ${t('needsAction.notApplied')}`
}

/** «Show in deadlines»: scroll the ad's row to the middle, give it focus, and light it for 1.8s
 * (DESIGN.md, Deadline rows). */
function showInDeadlines(feedId: string) {
  const row = document.getElementById(deadlineRowId(feedId))
  if (!row) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  row.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  row.focus({ preventScroll: true })
  row.dataset.lit = ''
  window.setTimeout(() => delete row.dataset.lit, 1800)
}

export function NeedsAction() {
  // Same query as DeadlineList's default view, so the two share one request and one cache entry.
  const { data: ads = [], isError, refetch } = useQuery(adsQuery())
  const { focus } = useFocus()
  const t = useT()
  const loadError = isError ? t('needsAction.loadError') : null

  // Days left from the frist and the shared Norwegian today, as DeadlineList counts them, so the
  // sentence and the row it points to name the same count after midnight too.
  const today = useToday()
  const needsAction = ads.flatMap((ad) => {
    const daysLeft = daysLeftFrom(dayOf(ad.expires), today, ad.daysLeft)
    return adMatchesFocus(ad, focus) && ad.pipelineStatus === 'active' && isClosing(daysLeft)
      ? [{ ad, daysLeft: daysLeft as number }]
      : []
  })

  if (!loadError && needsAction.length === 0) return null

  // DESIGN.md: a sentence between hairlines with a rust run-in lead, never a filled panel or side
  // stripe. The lead is the section's heading, so the sentence reads on from it.
  return (
    <section
      aria-labelledby="needs-action-heading"
      className="flex flex-col gap-x-3 gap-y-1 border-y border-border py-1.5 font-sans text-body-sm md:flex-row md:items-baseline"
    >
      <h2
        id="needs-action-heading"
        className="shrink-0 pt-2.5 font-heading text-body-sm font-semibold text-rust md:pt-0"
      >
        {t('needsAction.heading')}
      </h2>
      <div className="flex min-w-0 flex-1 flex-col">
        {loadError && (
          <p role="status" className="flex flex-wrap items-center gap-x-3">
            <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
            {loadError}
            <Button variant="link" className="min-h-11" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          </p>
        )}
        <ul className="flex list-none flex-col ps-0">
          {needsAction.map(({ ad, daysLeft }) => (
            <li
              key={ad.feedId}
              className="flex flex-col gap-x-6 md:flex-row md:items-baseline md:justify-between"
            >
              <span className="text-pretty md:py-3">{sentence(ad, daysLeft, t)}</span>
              <Button
                variant="link"
                className="-ms-2.5 min-h-11 shrink-0 self-start md:ms-0"
                onClick={() => showInDeadlines(ad.feedId)}
              >
                {t('needsAction.show')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
