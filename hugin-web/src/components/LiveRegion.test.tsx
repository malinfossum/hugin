import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveRegionProvider, useAnnounce } from './LiveRegion'

function Announcer({ message }: { message: string }) {
  const announce = useAnnounce()
  return (
    <button type="button" onClick={() => announce(message)}>
      Announce
    </button>
  )
}

function renderRegion(message = 'Synk ferdig.') {
  return render(
    <LiveRegionProvider>
      <Announcer message={message} />
    </LiveRegionProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveRegionProvider', () => {
  it('puts the message in the polite live region after a short delay', () => {
    renderRegion()

    act(() => screen.getByRole('button', { name: 'Announce' }).click())
    act(() => vi.advanceTimersByTime(50))

    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Synk ferdig.')
  })

  it('leaves no timer behind when it unmounts mid-announce (regression)', () => {
    // A timer that outlives the provider fires after a test's jsdom is torn down, and the
    // state update then throws «window is not defined» outside any test.
    const { unmount } = renderRegion()

    act(() => screen.getByRole('button', { name: 'Announce' }).click())
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
