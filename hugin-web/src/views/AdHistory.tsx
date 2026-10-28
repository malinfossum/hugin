import { cn } from '@/lib/utils'
import {
  LifelineFuture,
  PHONE_LABEL_CHIP,
  PhoneTodayLine,
  ScaleBand,
} from '../components/TimeSheet'
import { localeFor, useLang, useT } from '../i18n'
import { formatDate, formatDayMonth } from '../lib/dates'
import { daysLeftText, isClosing, labelFlips, lifelineTone, pct } from '../lib/lifeline'
import { dayNumber, months, monthWindow, position } from '../lib/timeScale'
import type { AdDto } from '../lib/types'
import { useNarrow } from '../lib/useMediaQuery'

/** A company's ad history as a sheet (DESIGN.md, the Lifeline rule): each ad a row, its title in
 * the title column and its life drawn from the day it was published to its frist, on one scale of
 * whole months that holds the whole history and today. The dates are also in each row's subline,
 * so the drawing is never the only place they are. An expired ad is drawn all in the past, in
 * ink-tertiary, and its title drops to ink-secondary: it never reads as active. */
export function AdHistory({ ads }: { ads: AdDto[] }) {
  const t = useT()
  const [lang] = useLang()
  const narrow = useNarrow()

  if (ads.length === 0)
    return <p className="text-body-sm text-ink-tertiary">{t('companies.noAds')}</p>

  const now = new Date()
  const today = dayNumber(now)
  const dayOf = (iso: string | null) => (iso ? dayNumber(new Date(iso)) : null)
  const days = ads.flatMap((ad) =>
    [dayOf(ad.published), dayOf(ad.expires)].filter((day): day is number => day !== null)
  )
  // At least a month past today, so an open ad's future has room to be read.
  const scale = monthWindow(Math.min(today, ...days), Math.max(today + 30, ...days))
  const at = (day: number) => position(scale, day)
  const segments = months(scale)
  // Month names under the bar while they fit: every month for a year, every quarter for three,
  // and past that only the years above it. A phone keeps half as many.
  const step = (segments.length <= 12 ? 1 : segments.length <= 36 ? 3 : 0) * (narrow ? 2 : 1)
  // Years in map lettering: at each January, and at the start unless January is the next month.
  const years = segments.filter(
    (month, i) => month.first.getMonth() === 0 || (i === 0 && segments[1]?.first.getMonth() !== 0)
  )

  return (
    <div className="flex flex-col">
      {/* The scale bar: alternating whole months, the year above in map lettering. */}
      <div aria-hidden="true" className="flex">
        <div className="hidden shrink-0 md:block md:w-90" />
        <div className="relative h-14 flex-1">
          {years.map((month) => (
            <span
              key={month.first.getTime()}
              className={cn(
                'absolute top-0.5 text-xs font-semibold tracking-widest text-contour uppercase',
                month.x > 88 ? 'right-0' : 'at-x'
              )}
              style={month.x > 88 ? undefined : { '--x': pct(month.x) }}
            >
              {month.first.getFullYear()}
            </span>
          ))}
          <span
            className={cn(
              'at-x absolute top-0.5 text-xs font-semibold whitespace-nowrap md:hidden',
              at(today) > 70 ? '-translate-x-full pe-1.5' : 'ps-1.5'
            )}
            style={{ '--x': pct(at(today)) }}
          >
            {t('deadlines.todayMark', { date: formatDayMonth(now) })}
          </span>
          {segments.map((month, i) => (
            <span key={month.first.getTime()}>
              <ScaleBand x={month.x} width={month.width} filled={month.filled} />
              {step > 0 && i % step === 0 && (
                <span
                  className="at-x absolute bottom-0 text-xs text-ink-tertiary tabular-nums"
                  style={{ '--x': pct(month.x) }}
                >
                  {month.first.toLocaleString(localeFor(lang), { month: 'short' })}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="relative">
        <ul className="flex list-none flex-col border-b border-border ps-0">
          {ads.map((ad) => {
            const published = dayOf(ad.published)
            const expires = dayOf(ad.expires)
            const from = published ?? expires ?? today
            // An open ad's past runs to today; an expired one's whole life is past.
            const pastEnd = ad.isActive ? today : (expires ?? from)
            // The company endpoint leaves daysLeft out; the frist says it just as well.
            const daysLeft =
              ad.daysLeft ?? (ad.isActive && expires !== null ? expires - today : null)
            const tone = lifelineTone({ ...ad, daysLeft })
            const future = ad.isActive && expires !== null && expires >= today
            const labelAt = future ? (expires as number) : today
            const flip = labelFlips(at(labelAt), narrow)
            return (
              <li
                key={ad.feedId}
                className="flex flex-col border-t border-border md:min-h-17.5 md:flex-row"
              >
                <div className="flex min-w-0 flex-col justify-center gap-0.5 pt-3 pb-1 md:w-90 md:shrink-0 md:py-3 md:pe-5">
                  {/* A 44 px target in the title's own room, as in DeadlineList. */}
                  <span
                    className={cn(
                      'font-medium',
                      ad.sourceUrl ? '-my-3' : 'md:truncate',
                      ad.isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {ad.sourceUrl ? (
                      <a
                        href={ad.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative block w-fit max-w-full py-3 text-inherit no-underline hover:underline md:truncate"
                      >
                        {ad.title}
                      </a>
                    ) : (
                      ad.title
                    )}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-sm text-muted-foreground tabular-nums">
                    {!ad.isActive && (
                      <span className="font-semibold">{t('companies.expiredTag')}</span>
                    )}
                    {ad.published && (
                      <span>{t('companies.published', { date: formatDate(ad.published) })}</span>
                    )}
                    <span>
                      {t('companies.deadlineLabel', {
                        date: ad.expires ? formatDate(ad.expires) : t('companies.notGiven'),
                      })}
                    </span>
                  </span>
                </div>
                {/* The lifeline, on the history's one scale. It only flexes from md, as in
                DeadlineList: in the phone column flex-1 would zero its height. */}
                <div aria-hidden="true" className="relative mb-2 h-14 md:mb-0 md:h-auto md:flex-1">
                  <span
                    className="span-x absolute top-1/2 border-t border-ink-tertiary"
                    style={{
                      '--x': pct(at(from)),
                      '--w': pct(Math.max(0, at(pastEnd) - at(from))),
                    }}
                  />
                  <span
                    className="at-x absolute top-1/2 size-1.75 -translate-1/2 rounded-full border border-ink-tertiary bg-background"
                    style={{ '--x': pct(at(from)) }}
                  />
                  {!ad.isActive && expires !== null && (
                    <span
                      className="at-x absolute top-1/2 h-3 w-px -translate-1/2 bg-ink-tertiary"
                      style={{ '--x': pct(at(expires)) }}
                    />
                  )}
                  <PhoneTodayLine x={at(today)} />
                  {future && (
                    <LifelineFuture from={at(today)} to={at(expires as number)} tone={tone} />
                  )}
                  {ad.isActive && (
                    <span
                      className={cn(
                        'at-x absolute text-sm whitespace-nowrap tabular-nums',
                        flip
                          ? cn('bottom-1/2 mb-2 -translate-x-full', PHONE_LABEL_CHIP.popover)
                          : 'top-1/2 -translate-y-1/2 ps-3',
                        isClosing(daysLeft) ? 'font-semibold text-rust' : 'text-muted-foreground'
                      )}
                      style={{ '--x': pct(at(labelAt)) }}
                    >
                      {daysLeftText(daysLeft, t)}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {/* Today's line over the lifeline column, reaching up through the scale bar. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 left-90 hidden md:block"
        >
          <div
            className="at-x absolute -top-7 bottom-0 border-l border-foreground"
            style={{ '--x': pct(at(today)) }}
          >
            <span
              className={cn(
                'absolute -bottom-6.5 text-small font-semibold whitespace-nowrap',
                at(today) > 88 ? 'right-1.5' : 'left-1.5'
              )}
            >
              {t('deadlines.todayMark', { date: formatDayMonth(now) })}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-9 flex flex-wrap gap-x-6.5 gap-y-1.5 border-t border-border pt-3.5 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-3 border-rust" />
          {t('deadlines.keyClosing')}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-lake" />
          {t('deadlines.keyApplied')}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-contour" />
          {t('deadlines.keyOpen')}
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t border-ink-tertiary" />
          {t('companies.keyPast')}
        </span>
      </p>
    </div>
  )
}
