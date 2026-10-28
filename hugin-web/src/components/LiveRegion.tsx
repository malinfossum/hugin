import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

const AnnounceContext = createContext<(message: string) => void>(() => {})
export const useAnnounce = () => useContext(AnnounceContext)

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const clearTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const announce = useCallback((next: string) => {
    setMessage('') // retrigger even for identical text
    clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => setMessage(next), 50)
  }, [])

  // A pending announcement dies with the region, so its update never lands after unmount.
  useEffect(() => () => clearTimeout(clearTimer.current), [])

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div aria-live="polite" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  )
}
