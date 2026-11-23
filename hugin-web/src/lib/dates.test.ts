import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calendarDate,
  dateOfDay,
  dayNumber,
  dayOf,
  formatDate,
  formatDayMonth,
  formatTime,
  monthName,
  osloParts,
} from './dates'

// Every case runs with the browser in a zone that is not Norway's: one behind UTC, one far ahead
// of it, and UTC itself (the CI runner). A frist must print the same Norwegian date in all three.
describe.each(['America/New_York', 'Pacific/Auckland', 'UTC'])('in %s', (zone) => {
  beforeEach(() => {
    vi.stubEnv('TZ', zone)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('runs in the zone it names', () => {
    // Guards the cases below: if the zone did not take, they would prove nothing.
    const offset = new Date('2026-11-23T12:00:00Z').getTimezoneOffset()
    expect(offset).toBe({ 'America/New_York': 300, 'Pacific/Auckland': -780, UTC: 0 }[zone])
  })

  describe('formatDate', () => {
    it('prints the Norwegian date of an instant after Norwegian midnight', () => {
      expect(formatDate('2026-11-23T23:30:00Z')).toBe('24.11.2026')
    })
    it('prints the Norwegian date of the last second of a Norwegian day', () => {
      expect(formatDate('2026-11-23T22:59:59Z')).toBe('23.11.2026')
      expect(formatDate('2026-11-23T23:59:59+01:00')).toBe('23.11.2026')
    })
    it('uses summer time in summer', () => {
      expect(formatDate('2026-06-15T23:59:59+02:00')).toBe('15.06.2026')
      expect(formatDate('2026-06-15T22:30:00Z')).toBe('16.06.2026')
    })
    it('pads day and month', () => {
      expect(formatDate('2026-01-05T12:00:00Z')).toBe('05.01.2026')
    })
  })

  describe('formatTime', () => {
    it('renders Norwegian HH:mm', () => {
      expect(formatTime('2026-08-23T12:05:00Z')).toBe('14:05')
      expect(formatTime('2026-11-23T23:30:00Z')).toBe('00:30')
    })
  })

  describe('formatDayMonth', () => {
    it('renders a padded dd.MM of a calendar date', () => {
      expect(formatDayMonth(calendarDate(2026, 0, 5))).toBe('05.01')
    })
    it('renders the Norwegian dd.MM of an instant', () => {
      expect(formatDayMonth(new Date('2026-11-23T23:30:00Z'))).toBe('24.11')
    })
  })

  describe('dayNumber', () => {
    it('counts the Norwegian day of an instant', () => {
      expect(dayNumber(new Date('2026-11-23T23:30:00Z'))).toBe(
        dayNumber(calendarDate(2026, 10, 24))
      )
      expect(dayNumber(new Date('2026-11-23T22:59:59Z'))).toBe(
        dayNumber(calendarDate(2026, 10, 23))
      )
    })
    it('counts whole Norwegian days across the October DST change', () => {
      const before = new Date('2026-10-24T00:30:00+02:00')
      const after = new Date('2026-10-26T00:30:00+01:00')
      expect(dayNumber(after) - dayNumber(before)).toBe(2)
    })
    it('round-trips through dateOfDay', () => {
      const day = dayNumber(calendarDate(2026, 2, 29))
      expect(dateOfDay(day)).toEqual(calendarDate(2026, 2, 29))
      expect(osloParts(dateOfDay(day))).toMatchObject({ year: 2026, monthIndex: 2, day: 29 })
    })
  })

  describe('monthName', () => {
    it('names the Norwegian month of an instant', () => {
      expect(monthName(new Date('2026-11-30T23:30:00Z'), 'nb-NO', 'long')).toBe('desember')
      expect(monthName(calendarDate(2026, 0, 1), 'en-GB', 'short')).toBe('Jan')
    })
  })

  describe('an unreadable timestamp', () => {
    it('prints as nothing instead of throwing', () => {
      expect(formatDate('not a date')).toBe('')
      expect(formatTime('not a date')).toBe('')
      expect(formatDayMonth(new Date(Number.NaN))).toBe('')
      expect(monthName(new Date(Number.NaN), 'nb-NO', 'long')).toBe('')
    })
    it('has no day', () => {
      expect(dayOf('not a date')).toBeNull()
      expect(dayOf(null)).toBeNull()
      expect(dayOf('2026-11-23T23:30:00Z')).toBe(dayNumber(calendarDate(2026, 10, 24)))
      expect(dayNumber(new Date(Number.NaN))).toBeNaN()
    })
  })
})
