import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './dates'

describe('formatDate', () => {
  it('renders dd.MM.yyyy regardless of locale', () => {
    expect(formatDate('2026-08-23T00:00:00+02:00')).toBe('23.08.2026')
  })
  it('pads day and month', () => {
    expect(formatDate('2026-01-05T12:00:00Z')).toBe('05.01.2026')
  })
})

describe('formatDateTime', () => {
  it('renders dd.MM.yyyy HH:mm', () => {
    expect(formatDateTime('2026-08-23T14:05:00')).toBe('23.08.2026 14:05')
  })
})
