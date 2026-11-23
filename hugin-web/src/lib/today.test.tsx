import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayNumber } from './dates'
import { useToday } from './today'

function Today({ name }: { name: string }) {
  return <p data-testid={name}>{useToday()}</p>
}

/** Records every day it renders with, the first render included. */
function Recorder({ seen }: { seen: number[] }) {
  seen.push(useToday())
  return null
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

  // The first render is read before any view subscribes, so it must not show a cached day for a
  // frame and only then correct itself. Each case jumps the clock well past the once-a-second read.
  it.each([
    ['forward', '2026-06-20T10:00:00Z'],
    ['back', '2026-06-10T10:00:00Z'],
  ])('first renders the day on the clock after it moves %s, not a cached one', (_, later) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T10:00:00Z'))
    render(<Recorder seen={[]} />).unmount()

    vi.setSystemTime(new Date(later))
    const seen: number[] = []
    render(<Recorder seen={seen} />)

    expect(seen[0]).toBe(dayNumber(new Date(later)))
  })
})
