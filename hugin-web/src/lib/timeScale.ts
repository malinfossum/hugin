// One time scale for every lifeline chart (DESIGN.md, the Scale Bar and Lifeline rules): a window
// of whole weeks that starts on a Monday a few weeks back and runs some weeks ahead, the same day
// width everywhere it is drawn. A company's history spans months or years, so its sheet uses a
// window of whole months instead, read off a bar of alternating months. Days are Norwegian
// calendar days in every browser (dates.ts). A frist ends at 23:59:59 Norwegian time and the
// server counts days left in Norwegian dates, so the lifeline ends on the date the count names.

import { calendarDate, dateOfDay, dayNumber, osloParts } from './dates'

export interface TimeWindow {
  /** First day (a Monday, or a first of the month for a month window), inclusive. */
  start: number
  /** Day after the last, exclusive. */
  end: number
}

/** Starts on the Monday on or before `today - back` days and spans `weeks` whole weeks. */
export function timeWindow(today: Date, back: number, weeks: number): TimeWindow {
  const from = dayNumber(today) - back
  // Day number 0 (1970-01-01) was a Thursday; Monday-based weekday is (day + 3) mod 7.
  const start = from - ((((from + 3) % 7) + 7) % 7)
  return { start, end: start + weeks * 7 }
}

/** Position of a day as a percentage of the window, clamped to the window. */
export function position(window: TimeWindow, day: number): number {
  const span = window.end - window.start
  return Math.min(100, Math.max(0, ((day - window.start) / span) * 100))
}

export interface Week {
  /** Monday of the week, as a calendar date (dates.ts). */
  monday: Date
  /** Left edge and width, in percent. */
  x: number
  width: number
  /** Alternates along the bar, like the black and white segments of a map's scale. */
  filled: boolean
}

export function weeks(window: TimeWindow): Week[] {
  const out: Week[] = []
  for (let day = window.start, i = 0; day < window.end; day += 7, i++) {
    out.push({
      monday: dateOfDay(day),
      x: position(window, day),
      width: (7 / (window.end - window.start)) * 100,
      filled: i % 2 === 0,
    })
  }
  return out
}

export interface MonthLabel {
  /** First of the month, or the window's start for a month that began before it, as a calendar
   * date (dates.ts). */
  date: Date
  x: number
  /** Near the right edge the label is set right-aligned so it stays inside the bar. */
  alignEnd: boolean
}

/** A label at each first of a month inside the window, plus the starting month when the window
 * holds at least two weeks of it (a sliver of a month would crowd the next label). */
export function monthLabels(window: TimeWindow): MonthLabel[] {
  const out: MonthLabel[] = []
  const first = dateOfDay(window.start)
  const { year, monthIndex, day: firstDay } = osloParts(first)
  const nextMonth = dayNumber(calendarDate(year, monthIndex + 1, 1))
  if (firstDay !== 1 && nextMonth - window.start >= 14) {
    out.push({ date: first, x: 0, alignEnd: false })
  }
  for (let day = window.start; day < window.end; day++) {
    const date = dateOfDay(day)
    if (osloParts(date).day !== 1) continue
    const x = position(window, day)
    out.push({ date, x, alignEnd: x > 78 })
  }
  return out
}

/** Whole months from the one holding `first` to the one holding `last`, widened back to at least
 * `minMonths` so a short history still has room to read. */
export function monthWindow(first: number, last: number, minMonths = 3): TimeWindow {
  const from = osloParts(dateOfDay(first))
  const to = osloParts(dateOfDay(last))
  const end = calendarDate(to.year, to.monthIndex + 1, 1)
  const { year, monthIndex } = osloParts(end)
  const span = (year - from.year) * 12 + monthIndex - from.monthIndex
  const start = calendarDate(year, monthIndex - Math.max(span, minMonths), 1)
  return { start: dayNumber(start), end: dayNumber(end) }
}

export interface Month {
  /** First of the month, as a calendar date (dates.ts). */
  first: Date
  /** Left edge and width, in percent. */
  x: number
  width: number
  /** Alternates along the bar, like the black and white segments of a map's scale. */
  filled: boolean
}

/** The months of a month window, as segments of its scale bar. */
export function months(window: TimeWindow): Month[] {
  const out: Month[] = []
  const first = osloParts(dateOfDay(window.start))
  for (let i = 0; ; i++) {
    const date = calendarDate(first.year, first.monthIndex + i, 1)
    const day = dayNumber(date)
    if (day >= window.end) break
    const next = dayNumber(calendarDate(first.year, first.monthIndex + i + 1, 1))
    out.push({
      first: date,
      x: position(window, day),
      width: position(window, next) - position(window, day),
      filled: i % 2 === 0,
    })
  }
  return out
}
