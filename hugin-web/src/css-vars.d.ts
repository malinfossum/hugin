import 'react'

declare module 'react' {
  /** The time-scale geometry custom properties (index.css at-x / span-x). */
  interface CSSProperties {
    '--x'?: string
    '--w'?: string
  }
}
