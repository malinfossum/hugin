// One time scale for every lifeline chart (DESIGN.md, the Scale Bar and Lifeline rules): a window
// of whole weeks that starts on a Monday a few weeks back and runs some weeks ahead, the same day
// width everywhere it is drawn. Days are local calendar days, so an ad that expires 23:59 UTC
// lands on the date the user sees.

const DAY_MS = 86_400_000

/** Local calendar day as a day number, so differences are whole days across DST changes. */
export function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
}

function dateOfDay(day: number): Date {
  const utc = new Date(day * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

export interface TimeWindow {
  /** First day (a Monday), inclusive. */
  start: number
  /** Day after the last, exclusive: start + weeks * 7. */
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
  /** Monday of the week, as a Date. */
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
  /** First of the month, or the window's start for a month that began before it. */
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
  const nextMonth = dayNumber(new Date(first.getFullYear(), first.getMonth() + 1, 1))
  if (first.getDate() !== 1 && nextMonth - window.start >= 14) {
    out.push({ date: first, x: 0, alignEnd: false })
  }
  for (let day = window.start; day < window.end; day++) {
    const date = dateOfDay(day)
    if (date.getDate() !== 1) continue
    const x = position(window, day)
    out.push({ date, x, alignEnd: x > 78 })
  }
  return out
}
