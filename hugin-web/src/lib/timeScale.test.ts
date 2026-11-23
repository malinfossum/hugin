import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { calendarDate, dayNumber, osloParts } from './dates'
import { monthLabels, months, monthWindow, position, timeWindow, weeks } from './timeScale'

// 09:24 on Friday 16.10 in Norway.
const friday16Oct = new Date('2026-10-16T09:24:00+02:00')

// The scale must not move with the browser's zone: every day here is a Norwegian day. A zone far
// ahead of Norway puts most Norwegian mornings on the next local date.
beforeAll(() => {
  vi.stubEnv('TZ', 'Pacific/Auckland')
})
afterAll(() => {
  vi.unstubAllEnvs()
})

describe('timeScale', () => {
  it('starts the window on the Monday on or before today minus the lookback', () => {
    const w = timeWindow(friday16Oct, 21, 12)
    // 16.10 - 21 days = 25.09 (a Friday); the Monday before is 21.09.
    expect(w.start).toBe(dayNumber(calendarDate(2026, 8, 21)))
    expect(w.end - w.start).toBe(84)
  })

  it('keeps the start when the lookback lands on a Monday', () => {
    const w = timeWindow(calendarDate(2026, 9, 26), 21, 4)
    expect(w.start).toBe(dayNumber(calendarDate(2026, 9, 5)))
  })

  it('places days as clamped percentages of the window', () => {
    const w = timeWindow(friday16Oct, 21, 12)
    expect(position(w, w.start)).toBe(0)
    expect(position(w, w.start + 42)).toBe(50)
    expect(position(w, w.start - 30)).toBe(0)
    expect(position(w, w.end + 30)).toBe(100)
  })

  it('counts whole Norwegian days across the October DST change', () => {
    const before = new Date('2026-10-24T00:30:00+02:00')
    const after = new Date('2026-10-26T00:30:00+01:00')
    expect(dayNumber(after) - dayNumber(before)).toBe(2)
  })

  it('takes today as the Norwegian date', () => {
    // Noon UTC on Sunday 25.10 is already Monday 26.10 in Auckland, but still Sunday in Norway,
    // so the week starts on Monday 19.10.
    const w = timeWindow(new Date('2026-10-25T12:00:00Z'), 0, 1)
    expect(w.start).toBe(dayNumber(calendarDate(2026, 9, 19)))
  })

  it('splits the window into alternating whole weeks', () => {
    const list = weeks(timeWindow(friday16Oct, 21, 12))
    expect(list).toHaveLength(12)
    expect(list[0].monday).toEqual(calendarDate(2026, 8, 21))
    expect(list.map((week) => week.filled).slice(0, 3)).toEqual([true, false, true])
    expect(list[1].x).toBeCloseTo(100 / 12)
  })

  it('labels each first of a month, right-aligning one near the end', () => {
    const labels = monthLabels(timeWindow(friday16Oct, 21, 12))
    // Window 21.09 to 13.12: September's 10 days get no label; October, November, December do.
    expect(labels.map((l) => osloParts(l.date).monthIndex)).toEqual([9, 10, 11])
    expect(labels.at(-1)?.alignEnd).toBe(true)
    expect(labels[0].alignEnd).toBe(false)
  })

  it('labels the starting month when the window holds at least two weeks of it', () => {
    // Narrow window from 05.10: 27 days of October, so October is labeled at the left edge.
    const labels = monthLabels(timeWindow(friday16Oct, 11, 9))
    expect(labels[0]).toEqual({ date: calendarDate(2026, 9, 5), x: 0, alignEnd: false })
  })
})

describe('month scale', () => {
  it('spans whole months from the first day to the last', () => {
    const w = monthWindow(
      dayNumber(calendarDate(2025, 10, 14)),
      dayNumber(calendarDate(2026, 9, 16))
    )
    expect(w.start).toBe(dayNumber(calendarDate(2025, 10, 1)))
    expect(w.end).toBe(dayNumber(calendarDate(2026, 10, 1)))
  })

  it('widens a short history back to the minimum number of months', () => {
    const day = dayNumber(friday16Oct)
    const w = monthWindow(day, day, 3)
    expect(w.start).toBe(dayNumber(calendarDate(2026, 7, 1)))
    expect(w.end).toBe(dayNumber(calendarDate(2026, 10, 1)))
  })

  it('splits the window into alternating months whose widths fill the bar', () => {
    const list = months(monthWindow(dayNumber(calendarDate(2026, 0, 5)), dayNumber(friday16Oct)))
    expect(list).toHaveLength(10)
    expect(list[0].first).toEqual(calendarDate(2026, 0, 1))
    expect(list.map((month) => month.filled).slice(0, 3)).toEqual([true, false, true])
    expect(list.reduce((sum, month) => sum + month.width, 0)).toBeCloseTo(100)
  })
})
