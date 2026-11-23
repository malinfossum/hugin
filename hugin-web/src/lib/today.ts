import { useSyncExternalStore } from 'react'
import { dayNumber } from './dates'

// Today's Norwegian date, shared by every view that counts days to a frist. Each view reading the
// clock on its own would let a re-render after midnight move one view to the new day while the
// needs-action sentence beside it still counts from the old one. One store, checked once a minute,
// moves them all in the same render.

const CHECK_MS = 60_000
const listeners = new Set<() => void>()
let today = dayNumber(new Date())
let timer: ReturnType<typeof setInterval> | undefined

function check() {
  const now = dayNumber(new Date())
  if (now === today) return
  today = now
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    // A view mounting after a quiet spell (a tab left in the background) starts from today.
    check()
    timer = setInterval(check, CHECK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

// With no view subscribed the cached day may be stale, so a first render reads the clock. React
// reads the snapshot more than once per render and every read must agree, so the clock is read
// at most once a second and the reads in between get the cached day. A clock set back reads at
// once too.
let readAt = 0
function snapshot() {
  const now = Date.now()
  if (listeners.size === 0 && Math.abs(now - readAt) > 1000) {
    today = dayNumber(new Date(now))
    readAt = now
  }
  return today
}

/** Today's Norwegian date as a day number (see dayNumber), the same in every view that reads it
 * and moved to the next day in all of them at once. */
export function useToday(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
