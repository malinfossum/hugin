import { useSyncExternalStore } from 'react'

/** Whether a media query matches, kept in sync as the viewport changes. False where the
 * environment has no matchMedia (jsdom in tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false
  )
}

/** Below Tailwind's md breakpoint: the phone layout. Written as "not md" so the query stays
 * mobile-first (min-width only), and in rem like md itself, so it still agrees with the CSS when
 * the browser's default font size is not 16 px. */
export const useNarrow = () => useMediaQuery('not all and (min-width: 48rem)')
