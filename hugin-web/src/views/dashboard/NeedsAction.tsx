import { useQuery } from '@tanstack/react-query'
import { Button } from '../../components/ui/button'
import { adMatchesFocus, useFocus } from '../../context/focus'
import { type T, useT } from '../../i18n'
import { adsQuery } from '../../lib/queries'

function deadlineText(daysLeft: number, t: T): string {
  if (daysLeft < 0) return t('needsAction.deadlineExpired')
  if (daysLeft === 0) return t('needsAction.deadlineToday')
  if (daysLeft === 1) return t('needsAction.deadlineInOneDay')
  return t('needsAction.deadlineInDays', { n: daysLeft })
}

export function NeedsAction() {
  // Same query as DeadlineList's default view, so the two share one request and one cache entry.
  const { data: ads = [], isError, refetch } = useQuery(adsQuery())
  const { focus } = useFocus()
  const t = useT()
  const loadError = isError ? t('needsAction.loadError') : null

  const needsAction = ads.filter(
    (ad) =>
      adMatchesFocus(ad, focus) &&
      ad.pipelineStatus === 'active' &&
      ad.daysLeft !== null &&
      ad.daysLeft <= 7
  )

  if (!loadError && needsAction.length === 0) return null

  // DESIGN.md: a sentence between hairlines with a rust lead, never a filled panel or side stripe.
  return (
    <section
      aria-labelledby="needs-action-heading"
      className="flex flex-col gap-1.5 border-y border-border py-3 font-sans text-body-sm"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="needs-action-heading" className="font-heading text-body-sm font-semibold text-rust">
          {t('needsAction.heading')}
        </h2>
        <p className="text-small text-muted-foreground">{t('needsAction.description')}</p>
      </div>
      {loadError && (
        <p role="status" className="flex flex-wrap items-center gap-x-3">
          {loadError}
          <Button variant="link" className="min-h-11" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      <ul className="flex list-none flex-col gap-1 ps-0">
        {needsAction.map((ad) => (
          <li key={ad.feedId}>
            {t('needsAction.item', {
              title: ad.title,
              status: t('needsAction.notApplied'),
              deadline: deadlineText(ad.daysLeft as number, t),
            })}
          </li>
        ))}
      </ul>
    </section>
  )
}
