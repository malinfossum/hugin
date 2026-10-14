import { useRouter } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'

interface ReturnFocus {
  /** Call as a link that leaves the page is followed. Remembers the link by its
   * `data-return-focus` value and the history entry it was followed from. */
  remember: (key: string) => void
  /** Call once the page has rendered fresh data. If the page was left and its entry is current
   * again (Back, or a detail's close), focuses the remembered link inside `container`, or
   * `fallback` when the link is gone, and forgets it. Never moves focus the person has already
   * moved, and never scrolls. */
  restore: (container: HTMLElement | null, fallback?: HTMLElement | null) => void
}

const noop = () => {}

const ReturnFocusContext = createContext<ReturnFocus>({ remember: noop, restore: noop })

interface Pending {
  key: string
  /** The history entry the link was followed from. */
  index: number
  /** Set once a navigation away from that entry has resolved. A Ctrl-click that opened a new
   * tab, or a navigation the unsaved-changes guard blocked, does not set it by itself; a later
   * real navigation away does. */
  left: boolean
}

/** Views unmount when their route stops matching (spec v3.8, router change), so focus cannot
 * go back to the same element after Back. This remembers which link was followed, by identity,
 * and the view focuses its new copy once it has rendered. The history entry index keeps it to a
 * real return: reaching the same page through the nav is a new entry and focuses nothing. */
export function ReturnFocusProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pending = useRef<Pending | null>(null)

  useEffect(
    () =>
      router.subscribe('onResolved', ({ toLocation }) => {
        const target = pending.current
        if (target && toLocation.state.__TSR_index !== target.index) target.left = true
      }),
    [router]
  )

  const remember = useCallback(
    (key: string) => {
      pending.current = { key, index: router.history.location.state.__TSR_index, left: false }
    },
    [router]
  )

  const restore = useCallback(
    (container: HTMLElement | null, fallback?: HTMLElement | null) => {
      const target = pending.current
      if (!target?.left || !container) return
      if (router.history.location.state.__TSR_index !== target.index) return
      pending.current = null
      // The person is already somewhere: leave them there.
      const active = document.activeElement
      if (active && active !== document.body) return
      const link = [...container.querySelectorAll<HTMLElement>('[data-return-focus]')].find(
        (el) => el.dataset.returnFocus === target.key
      )
      // The router restores this page's scroll position; focusing must not move it.
      ;(link ?? fallback)?.focus({ preventScroll: true })
    },
    [router]
  )

  const value = useMemo(() => ({ remember, restore }), [remember, restore])
  return <ReturnFocusContext.Provider value={value}>{children}</ReturnFocusContext.Provider>
}

export function useReturnFocus(): ReturnFocus {
  return useContext(ReturnFocusContext)
}
