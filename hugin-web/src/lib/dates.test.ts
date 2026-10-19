import { describe, expect, it } from 'vitest'
import { formatDate, formatDayMonth, formatTime } from './dates'

describe('formatDate', () => {
  it('renders dd.MM.yyyy from a local timestamp', () => {
    expect(formatDate('2026-08-23T10:00:00')).toBe('23.08.2026')
  })
  it('pads day and month', () => {
    expect(formatDate('2026-01-05T12:00:00')).toBe('05.01.2026')
  })
})

describe('formatDayMonth', () => {
  it('renders a padded dd.MM', () => {
    expect(formatDayMonth(new Date(2026, 0, 5))).toBe('05.01')
  })
})

describe('formatTime', () => {
  it('renders HH:mm', () => {
    expect(formatTime('2026-08-23T14:05:00')).toBe('14:05')
  })
})
