// Every date and time Hugin shows is a Norwegian one. A frist is the end of a Norwegian day and
// the server counts days left in Norwegian dates, so the printed frist, the lifeline and the count
// only agree if the browser reads the calendar in Europe/Oslo too, whatever zone it is in. This
// module is the one place that reads a calendar: nothing else calls getDate, getHours, getMonth
// or toLocale* on a Date. Dates print as fixed dd.MM.yyyy, so NO and EN show the same string
// (spec v3.1 item 6: consistency over locale-linked formats).

const ZONE = 'Europe/Oslo'
const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

// h23 rather than hour12: false, which some engines print as 24 at midnight.
const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
})

export interface OsloParts {
  year: number
  /** 0 to 11, as in Date, so month arithmetic can overflow into the next year. */
  monthIndex: number
  day: number
  hour: number
  minute: number
}

/** The Norwegian wall-clock reading of an instant. */
export function osloParts(instant: Date): OsloParts {
  const read: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const part of partsFormat.formatToParts(instant)) {
    if (part.type !== 'literal') read[part.type] = Number(part.value)
  }
  return {
    year: read.year ?? 0,
    monthIndex: (read.month ?? 1) - 1,
    day: read.day ?? 1,
    hour: read.hour ?? 0,
    minute: read.minute ?? 0,
  }
}

/** A calendar date with no time of day, carried as 00:00 UTC on that date. In Norway that is
 * 01:00 or 02:00 on the same date, so every helper here reads it back as the date it names.
 * Month and day overflow like `new Date(y, m, d)`: month 12 is January of the next year. */
export function calendarDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day))
}

/** The Norwegian calendar day of an instant as a day number (whole days since 01.01.1970), so
 * differences are whole days across DST changes. */
export function dayNumber(instant: Date): number {
  const { year, monthIndex, day } = osloParts(instant)
  return Date.UTC(year, monthIndex, day) / DAY_MS
}

/** The calendar date of a day number, the inverse of dayNumber. */
export function dateOfDay(day: number): Date {
  return new Date(day * DAY_MS)
}

/** dd.MM.yyyy, the Norwegian date of an instant. */
export function formatDate(iso: string): string {
  const { year, monthIndex, day } = osloParts(new Date(iso))
  return `${pad(day)}.${pad(monthIndex + 1)}.${year}`
}

/** dd.MM, for the marks on a time sheet's scale. */
export function formatDayMonth(date: Date): string {
  const { monthIndex, day } = osloParts(date)
  return `${pad(day)}.${pad(monthIndex + 1)}`
}

/** HH:mm, Norwegian time. */
export function formatTime(iso: string): string {
  const { hour, minute } = osloParts(new Date(iso))
  return `${pad(hour)}:${pad(minute)}`
}

/** The name of the Norwegian month of a date, in the reader's language. */
export function monthName(date: Date, locale: string, width: 'long' | 'short'): string {
  return new Intl.DateTimeFormat(locale, { month: width, timeZone: ZONE }).format(date)
}
