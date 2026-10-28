import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAnnounce } from '../../components/LiveRegion'
import { LifelineFuture, PhoneTodayLine, ScaleBand } from '../../components/TimeSheet'
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard'
import { Button } from '../../components/ui/button'
import { NativeSelect, NativeSelectOption } from '../../components/ui/native-select'
import { toast } from '../../components/ui/toast'
import { adMatchesFocus, useFocus } from '../../context/focus'
import { useReadOnly } from '../../context/readOnly'
import { localeFor, useLang, useT } from '../../i18n'
import { ApiError } from '../../lib/api'
import { displayCompanyName } from '../../lib/companyName'
import { formatDate, formatDayMonth } from '../../lib/dates'
import {
  daysLeftText,
  deadlineRowId,
  isClosing,
  labelFlips,
  lifelineTone,
  pct,
} from '../../lib/lifeline'
import { useSavePipelineEntry, useSetAdHidden, useSetAdLink } from '../../lib/mutations'
import { pipelineLabel } from '../../lib/pipelineLabels'
import { adsQuery, pipelineQuery, statusQuery } from '../../lib/queries'
import { dayNumber, monthLabels, position, timeWindow, weeks } from '../../lib/timeScale'
import type { AdDto, PipelineDto } from '../../lib/types'
import { useNarrow } from '../../lib/useMediaQuery'

export type Show = 'active' | 'all'

interface DeadlineListProps {
  show: Show
  onShowChange: (show: Show) => void
  /** Where the display filter is changed; offered when it hides every open ad. */
  onOpenSettings?: () => void
}

export function DeadlineList({ show, onShowChange, onOpenSettings }: DeadlineListProps) {
  const queryClient = useQueryClient()
  const t = useT()
  // Switching the filter keeps the previous rows on screen until the new list arrives.
  const {
    data: ads = [],
    isError: loadFailed,
    isSuccess: loaded,
    refetch,
  } = useQuery({ ...adsQuery(show === 'all'), placeholderData: keepPreviousData })
  // Every row action refetches the ads lists on success (this one and the dashboard's
  // NeedsAction share the cache).
  const setHidden = useSetAdHidden()
  const setLink = useSetAdLink()
  const trackCompany = useSavePipelineEntry()
  const [actionError, setActionError] = useState<string | null>(null)
  const error = actionError ?? (loadFailed ? t('deadlines.loadError') : null)
  // The manual link form: which row has it open, the chosen orgnr, and the tracked companies
  // it offers (fetched afresh on every open, so a company tracked since is offered too; null
  // while loading, which keeps the form off-screen until the list is there).
  const [linking, setLinking] = useState<string | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [tracked, setTracked] = useState<PipelineDto[] | null>(null)
  // Opening the form picks nothing; only a chosen company is something to lose.
  const linkDirty = linking !== null && linkTarget !== ''
  const announce = useAnnounce()
  const { focus } = useFocus()
  const { readOnly } = useReadOnly()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const skjulRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // The link form replaces the button that opens it, so focus is moved by hand: into the select
  // when the form appears, back to that row's «Koble til bedrift» when it closes without a
  // request (returnFocusTo names the row). A completed link or unlink goes through moveFocus
  // instead, since the button that had focus is gone after the reload.
  const linkRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const linkSelectRef = useRef<HTMLSelectElement>(null)
  const returnFocusTo = useRef<string | null>(null)

  // Moved once the action has succeeded. The mutation resolves only after its refetch has landed.
  // null focuses the heading; a feedId focuses that row's Skjul button (which every action keeps).
  const moveFocus = (target: string | null) => {
    const button = target ? skjulRefs.current.get(target) : undefined
    if (button) button.focus()
    else headingRef.current?.focus()
  }

  useEffect(() => {
    if (linking !== null) {
      if (tracked !== null) linkSelectRef.current?.focus()
      return
    }
    const target = returnFocusTo.current
    if (target === null) return
    returnFocusTo.current = null
    linkRefs.current.get(target)?.focus()
  }, [linking, tracked])

  const visibleAds = ads.filter((ad) => adMatchesFocus(ad, focus))
  // Nothing to draw: the sheet (scale bar, lines, legend) gives way to one sentence naming why
  // and what to do next, rather than a legend for lines that are not there.
  const drawn = visibleAds.length > 0

  // The sheet's one time scale: three weeks back and nine ahead, tighter on a phone so a day
  // keeps some width. The seen mark is the review mark ("Mark as seen"); null before any sync.
  const { data: status } = useQuery(statusQuery())
  const [lang] = useLang()
  const narrow = useNarrow()
  const now = new Date()
  const scale = narrow ? timeWindow(now, 11, 9) : timeWindow(now, 21, 12)
  const at = (day: number) => position(scale, day)
  const today = dayNumber(now)
  const reviewMark = status?.reviewMark ? new Date(status.reviewMark) : null
  const seen = reviewMark ? dayNumber(reviewMark) : null
  const monthName = (date: Date) => date.toLocaleString(localeFor(lang), { month: 'long' })

  const handleSkjul = async (feedId: string) => {
    const index = visibleAds.findIndex((a) => a.feedId === feedId)
    const nextFeedId = visibleAds[index + 1]?.feedId ?? null
    try {
      await setHidden.mutateAsync({ feedId, hidden: true })
    } catch {
      setActionError(t('deadlines.hideError'))
      return
    }
    setActionError(null)
    moveFocus(nextFeedId)
    announce(t('deadlines.hiddenAnnounce'))
  }

  const handleTrack = async (ad: AdDto) => {
    if (!ad.employerOrgnr) return
    try {
      await trackCompany.mutateAsync({ orgnr: ad.employerOrgnr, status: 'active' })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('deadlines.trackError'))
      return
    }
    setActionError(null)
    const displayName = ad.employer ? displayCompanyName(ad.employer) : ad.employerOrgnr
    toast.add({ type: 'success', title: t('deadlines.trackedAnnounce', { name: displayName }) })
  }

  const handleAngreSkjul = async (feedId: string) => {
    try {
      await setHidden.mutateAsync({ feedId, hidden: false })
    } catch {
      setActionError(t('deadlines.unhideError'))
      return
    }
    setActionError(null)
    announce(t('deadlines.unhiddenAnnounce'))
  }

  const openLink = async (feedId: string) => {
    setLinking(feedId)
    setLinkTarget('')
    setTracked(null)
    try {
      // Fetched afresh on every open (the default staleTime is 0), so a company tracked since is offered.
      const entries = await queryClient.fetchQuery(pipelineQuery())
      setTracked(
        [...entries].sort((a, b) =>
          displayCompanyName(a.companyName).localeCompare(displayCompanyName(b.companyName), 'nb')
        )
      )
    } catch {
      setActionError(t('deadlines.linkError'))
      returnFocusTo.current = feedId
      setLinking(null)
    }
  }

  const closeLink = (feedId: string) => {
    returnFocusTo.current = feedId
    setLinking(null)
    setLinkTarget('')
  }

  const handleLink = async (feedId: string) => {
    const target = tracked?.find((c) => c.orgnr === linkTarget)
    if (!target) return
    try {
      await setLink.mutateAsync({ feedId, orgnr: target.orgnr })
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('deadlines.linkError'))
      return
    }
    setActionError(null)
    setLinking(null)
    setLinkTarget('')
    moveFocus(feedId)
    announce(t('deadlines.linkedAnnounce', { name: displayCompanyName(target.companyName) }))
  }

  const handleUnlink = async (feedId: string) => {
    try {
      await setLink.mutateAsync({ feedId, orgnr: null })
    } catch {
      setActionError(t('deadlines.unlinkError'))
      return
    }
    setActionError(null)
    moveFocus(feedId)
    announce(t('deadlines.unlinkedAnnounce'))
  }

  return (
    <section aria-labelledby="deadlines-heading" className="flex flex-col pt-4 font-sans">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h2
          id="deadlines-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-xl font-semibold"
        >
          {t('deadlines.heading')}
        </h2>
        <p className="text-body-sm text-muted-foreground">{t('deadlines.description')}</p>
        <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
          <label htmlFor="deadlines-show" className="text-sm text-muted-foreground">
            {t('deadlines.showLabel')}
          </label>
          <NativeSelect
            id="deadlines-show"
            size="touch"
            className="flex-1 md:flex-none"
            value={show}
            onChange={(event) => {
              setActionError(null)
              onShowChange(event.target.value as Show)
            }}
          >
            <NativeSelectOption value="active">{t('deadlines.showDefault')}</NativeSelectOption>
            <NativeSelectOption value="all">{t('deadlines.showAll')}</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
      {error && (
        <p
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
          {error}
          <Button
            variant="link"
            className="min-h-11"
            onClick={() => {
              setActionError(null)
              refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </p>
      )}

      {loaded && !drawn && (
        <p className="mt-5 flex flex-wrap items-center gap-x-3 border-t border-border pt-4 text-body-sm text-ink-tertiary">
          {ads.length === 0
            ? t('deadlines.empty')
            : t(ads.length === 1 ? 'deadlines.emptyFilteredOne' : 'deadlines.emptyFiltered', {
                n: ads.length,
              })}
          {ads.length > 0 && onOpenSettings && (
            <Button variant="link" className="min-h-11" onClick={onOpenSettings}>
              {t('companies.editInSettings')}
            </Button>
          )}
        </p>
      )}

      {/* The scale bar: alternating whole weeks under the month names, Monday dates under it.
      Every other date until lg: at md the scale column is only about 300 px wide and twelve
      dates run into each other. */}
      <div aria-hidden="true" hidden={!drawn} className="mt-5 flex">
        <div className="hidden shrink-0 md:block md:w-90" />
        <div className="relative h-21 flex-1 md:h-14">
          {seen !== null && (
            <span
              // Left of its line, unless that would push it off the bar's left edge.
              className={cn(
                'at-x absolute top-0 text-xs whitespace-nowrap text-contour md:hidden',
                at(seen) > 20 ? '-translate-x-full pe-1.5' : 'ps-1.5'
              )}
              style={{ '--x': pct(at(seen)) }}
            >
              {t('deadlines.seenMark', { date: formatDayMonth(reviewMark as Date) })}
            </span>
          )}
          <span
            className="at-x absolute top-4.5 ps-1.5 text-xs font-semibold whitespace-nowrap md:hidden"
            style={{ '--x': pct(at(today)) }}
          >
            {t('deadlines.todayMark', { date: formatDayMonth(now) })}
          </span>
          {monthLabels(scale).map((month) =>
            month.alignEnd ? (
              <span
                key={month.date.getTime()}
                className="absolute top-9 right-0 text-xs font-semibold tracking-widest text-contour uppercase md:top-0.5"
              >
                {monthName(month.date)}
              </span>
            ) : (
              <span
                key={month.date.getTime()}
                className="at-x absolute top-9 text-xs font-semibold tracking-widest text-contour uppercase md:top-0.5"
                style={{ '--x': pct(month.x) }}
              >
                {monthName(month.date)}
              </span>
            )
          )}
          {weeks(scale).map((week, i) => (
            <span key={week.monday.getTime()}>
              <ScaleBand x={week.x} width={week.width} filled={week.filled} />
              <span
                className={cn(
                  'at-x absolute bottom-0 text-xs text-ink-tertiary tabular-nums',
                  week.x > 4 && '-translate-x-1/2',
                  i % 2 === 1 && 'hidden lg:block'
                )}
                style={{ '--x': pct(week.x) }}
              >
                {formatDayMonth(week.monday)}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div hidden={!drawn} className="relative">
        <ul className="flex list-none flex-col ps-0">
          {visibleAds.map((ad) => {
            const published = ad.published ? new Date(ad.published) : null
            const from = published ? dayNumber(published) : null
            const expires = ad.expires ? dayNumber(new Date(ad.expires)) : null
            // The server's rule for "new since last visit": fetched after the mark.
            const isNew = reviewMark !== null && new Date(ad.firstSeen) > reviewMark
            const clipped = from === null || from < scale.start
            const tone = lifelineTone(ad)
            const end = expires ?? today
            const flip = labelFlips(at(end), narrow)
            return (
              <li
                key={ad.feedId}
                id={deadlineRowId(ad.feedId)}
                tabIndex={-1}
                className="group flex flex-col border-t border-border hover:bg-muted data-lit:bg-muted"
              >
                <div className="flex flex-col md:flex-row">
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 pt-4 pb-1 md:w-90 md:shrink-0 md:py-3.5 md:pe-5">
                    {/* A linked title is a 44 px target that takes no extra room: the link's
                    padding is handed back by the negative margin, and it sits above the line
                    under it (relative) so that padding still takes the tap. */}
                    <span className={cn('font-medium', ad.sourceUrl ? '-my-3' : 'md:truncate')}>
                      {ad.sourceUrl ? (
                        <a
                          href={ad.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative block w-fit max-w-full py-3 text-foreground no-underline hover:underline md:truncate"
                        >
                          {ad.title}
                        </a>
                      ) : (
                        ad.title
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                      {isNew && (
                        <span className="font-semibold text-forest">{t('deadlines.newBadge')}</span>
                      )}
                      {ad.pipelineStatus && (
                        <span
                          className={
                            ad.pipelineStatus === 'applied'
                              ? 'font-semibold text-lake'
                              : 'font-semibold text-foreground'
                          }
                        >
                          {pipelineLabel(t, ad.pipelineStatus)}
                        </span>
                      )}
                      <span>
                        {ad.employer ? displayCompanyName(ad.employer) : ad.employer}
                        {ad.kommuneNavn && ` · ${ad.kommuneNavn}`}
                      </span>
                      {/* The lifeline's start as text: the drawing alone only shows it as a
                      position on the scale (PRODUCT.md: a list behind what is drawn). */}
                      {published && (
                        <span className="sr-only">
                          {t('deadlines.published', { date: formatDate(ad.published as string) })}
                        </span>
                      )}
                    </span>
                    {!readOnly && (
                      // Reserved line: the employer never moves, the row height never jumps;
                      // shown on hover or focus, always on touch screens. Transparent, never
                      // hidden: the actions stay in the tab order and the accessibility tree, so
                      // a row whose title is not a link can still be reached by keyboard.
                      <span className="flex flex-wrap gap-x-3.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                        {ad.linkedOrgnr && (
                          <Button
                            variant="link"
                            size="xs"
                            className="min-h-11 min-w-11"
                            onClick={() => handleUnlink(ad.feedId)}
                          >
                            {t('deadlines.unlink')}
                          </Button>
                        )}
                        {!ad.pipelineStatus && ad.employerOrgnr && (
                          <Button
                            variant="link"
                            size="xs"
                            className="min-h-11 min-w-11"
                            onClick={() => handleTrack(ad)}
                          >
                            {t('deadlines.track')}
                          </Button>
                        )}
                        {!ad.pipelineStatus && linking !== ad.feedId && (
                          <Button
                            variant="link"
                            size="xs"
                            className="min-h-11 min-w-11"
                            ref={(el) => {
                              if (el) linkRefs.current.set(ad.feedId, el)
                              else linkRefs.current.delete(ad.feedId)
                            }}
                            onClick={() => openLink(ad.feedId)}
                          >
                            {t('deadlines.link')}
                          </Button>
                        )}
                        {ad.hidden ? (
                          <Button
                            variant="link"
                            size="xs"
                            className="min-h-11 min-w-11"
                            onClick={() => handleAngreSkjul(ad.feedId)}
                          >
                            {t('deadlines.undoHide')}
                          </Button>
                        ) : (
                          <Button
                            variant="link"
                            size="xs"
                            className="min-h-11 min-w-11"
                            ref={(el) => {
                              if (el) skjulRefs.current.set(ad.feedId, el)
                              else skjulRefs.current.delete(ad.feedId)
                            }}
                            onClick={() => handleSkjul(ad.feedId)}
                          >
                            {t('deadlines.hide')}
                          </Button>
                        )}
                      </span>
                    )}
                  </div>
                  {/* The lifeline: from the day the ad appeared to its frist, on the shared scale.
                  Below md the row is a column, where flex-1 would zero this box's height and hang
                  its labels over the lines above, so it only flexes from md. */}
                  <div className="relative mb-2 h-14 md:mb-0 md:h-auto md:min-h-17.5 md:flex-1">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'span-x absolute top-1/2',
                        // The past at ink-tertiary, not a hairline tone: it carries data, so it
                        // clears 3:1 against paper and the hover wash.
                        isNew ? 'border-t-2 border-forest' : 'border-t border-ink-tertiary',
                        clipped && 'fade-in-start'
                      )}
                      style={{
                        '--x': pct(clipped ? 0 : at(from ?? scale.start)),
                        '--w': pct(
                          Math.max(0, at(today) - (clipped ? 0 : at(from ?? scale.start)))
                        ),
                      }}
                    />
                    {clipped ? (
                      published && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1/2 left-0 mb-1.5 text-xs text-muted-foreground tabular-nums"
                        >
                          {t('deadlines.since', { date: formatDate(ad.published as string) })}
                        </span>
                      )
                    ) : (
                      <span
                        aria-hidden="true"
                        className={cn(
                          'at-x absolute top-1/2 size-1.75 -translate-1/2 rounded-full border',
                          isNew ? 'border-forest bg-forest' : 'border-ink-tertiary bg-background'
                        )}
                        style={{ '--x': pct(at(from ?? scale.start)) }}
                      />
                    )}
                    {/* Phones have no shared overlay; each line carries its own seen and today marks. */}
                    {seen !== null && (
                      <span
                        aria-hidden="true"
                        className="at-x absolute inset-y-2 border-l border-dashed border-contour md:hidden"
                        style={{ '--x': pct(at(seen)) }}
                      />
                    )}
                    <PhoneTodayLine x={at(today)} />
                    {expires !== null && expires >= today && (
                      <LifelineFuture from={at(today)} to={at(expires)} tone={tone} />
                    )}
                    <span
                      className={cn(
                        'at-x absolute text-sm whitespace-nowrap text-muted-foreground tabular-nums',
                        flip ? 'bottom-1/2 mb-2 -translate-x-full' : 'top-1/2 -translate-y-1/2 ps-3'
                      )}
                      style={{ '--x': pct(at(end)) }}
                    >
                      {ad.expires && (
                        <b
                          className={
                            isClosing(ad.daysLeft)
                              ? 'font-semibold text-rust'
                              : 'font-semibold text-foreground'
                          }
                        >
                          {formatDate(ad.expires)}
                        </b>
                      )}
                      {ad.expires && ' · '}
                      <span
                        className={isClosing(ad.daysLeft) ? 'font-semibold text-rust' : undefined}
                      >
                        {daysLeftText(ad.daysLeft, t)}
                      </span>
                    </span>
                  </div>
                </div>
                {linking === ad.feedId && tracked !== null && (
                  <div className="flex flex-wrap items-end gap-3 pb-4">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`frist-link-${ad.feedId}`}
                        className="text-sm text-muted-foreground"
                      >
                        {t('deadlines.linkLabel')}
                      </label>
                      <NativeSelect
                        id={`frist-link-${ad.feedId}`}
                        ref={linkSelectRef}
                        size="touch"
                        value={linkTarget}
                        onChange={(event) => setLinkTarget(event.target.value)}
                      >
                        <NativeSelectOption value="">
                          {t('deadlines.linkPlaceholder')}
                        </NativeSelectOption>
                        {tracked.map((c) => (
                          <NativeSelectOption key={c.orgnr} value={c.orgnr}>
                            {displayCompanyName(c.companyName)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <Button
                      size="touch"
                      disabled={!linkTarget}
                      onClick={() => handleLink(ad.feedId)}
                    >
                      {t('deadlines.linkConfirm')}
                    </Button>
                    <Button variant="ghost" size="touch" onClick={() => closeLink(ad.feedId)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {/* The shared marks over the lifeline column: the dashed seen mark, today's line, and
        the forest wash between them (what is new). Both lines reach up through the scale bar,
        stopping short of the month names.
        Mark as seen slides the seen line up to today and the wash closes behind it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 left-90 hidden md:block"
        >
          {seen !== null && (
            <>
              <div
                className="span-x absolute inset-y-0 bg-forest-wash transition-all duration-700 ease-out motion-reduce:transition-none"
                style={{ '--x': pct(at(seen)), '--w': pct(Math.max(0, at(today) - at(seen))) }}
              />
              <div
                className="at-x absolute -top-7 bottom-0 border-l border-dashed border-contour transition-all duration-700 ease-out motion-reduce:transition-none"
                style={{ '--x': pct(at(seen)) }}
              >
                <span className="absolute right-1.5 -bottom-6.5 text-small whitespace-nowrap text-contour">
                  {t('deadlines.seenMark', { date: formatDayMonth(reviewMark as Date) })}
                </span>
              </div>
            </>
          )}
          <div
            className="at-x absolute -top-7 bottom-0 border-l border-foreground"
            style={{ '--x': pct(at(today)) }}
          >
            <span className="absolute -bottom-6.5 left-1.5 text-small font-semibold whitespace-nowrap">
              {t('deadlines.todayMark', { date: formatDayMonth(now) })}
            </span>
          </div>
        </div>
      </div>

      <p
        hidden={!drawn}
        className="mt-9 flex flex-wrap gap-x-6.5 gap-y-1.5 border-t border-border pt-3.5 text-small text-muted-foreground"
      >
        {/* New lines, the wash and the seen line all hang on a seen mark: no mark, no keys. */}
        {seen !== null && (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="w-5 border-t-2 border-forest" />
            {t('deadlines.keyNew')}
          </span>
        )}
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
        {seen !== null && (
          <>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3.5 w-5 bg-forest-wash" />
              {t('deadlines.keyNewBand')}
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3.5 border-l border-dashed border-contour" />
              {t('deadlines.keySeen')}
            </span>
          </>
        )}
      </p>

      <UnsavedChangesGuard dirty={linkDirty} />
    </section>
  )
}
