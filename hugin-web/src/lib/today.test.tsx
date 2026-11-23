import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayNumber } from './dates'
import { useToday } from './today'

function Today({ name }: { name: string }) {
  return <p data-testid={name}>{useToday()}</p>
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useToday', () => {
  it('moves every view to the next Norwegian day together, a minute after midnight at most', async () => {
    vi.useFakeTimers()
    // 23:59:30 on 23.11 in Norway (CET, UTC+1).
    vi.setSystemTime(new Date('2026-11-23T22:59:30Z'))
    const before = dayNumber(new Date())
    render(
      <>
        <Today name="sentence" />
        <Today name="row" />
      </>
    )
    expect(screen.getByTestId('sentence')).toHaveTextContent(String(before))
    expect(screen.getByTestId('row')).toHaveTextContent(String(before))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(screen.getByTestId('sentence')).toHaveTextContent(String(before + 1))
    expect(screen.getByTestId('row')).toHaveTextContent(String(before + 1))
  })

  it('starts from the clock, not a day cached while no view was showing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T10:00:00Z'))
    const { unmount } = render(<Today name="first" />)
    unmount()

    vi.setSystemTime(new Date('2026-06-20T10:00:00Z'))
    render(<Today name="later" />)

    expect(screen.getByTestId('later')).toHaveTextContent(String(dayNumber(new Date())))
  })
})
