// Hugin brand mark (Brand Pack v1.0.0 — two-mark system). `primary` (1B Corvid) is for
// 32 px and up; `micro` (1H Hybrid) keeps its silhouette legible at 16–24 px. Colored via
// currentColor — var() never resolves in an SVG presentation attribute, so no hardcoded fill.
interface Props {
  variant?: 'primary' | 'micro'
  title?: string
  className?: string
}

const paths = {
  primary:
    'M18 88 L13 73 L18 72 L14 62 L19 60 C17 49 19 36 24 26 C31 12 47 11 59 18 C63 21 66 25 69 29 C78 31 88 33 94 37 C97 39 98 42 97 45 L93 44 C85 43 78 44 72 46 C65 48 61 52 59 58 C57 65 60 71 66 75 L61 73 L66 80 L59 77 L63 85 L56 81 L61 91 C46 88 32 88 18 88 Z M45 34 C50 31 57 32 63 36 C58 41 50 42 46 38 C45 37 44 36 45 34 Z',
  micro:
    'M20 89 L16 73 L21 72 L17 62 L21 60 C19 49 21 36 26 26 C33 12 49 11 61 18 C65 21 68 25 71 29 C80 31 89 33 95 37 C98 39 99 42 98 45 L94 44 C86 43 79 44 73 46 C66 48 62 52 60 58 C58 66 60 75 64 84 L59 81 L63 90 L20 90 Z M47 34 C52 31 59 32 65 36 C60 41 52 42 48 38 C47 37 46 36 47 34 Z',
} as const

export function HuginMark({ variant = 'primary', title, className }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      focusable="false"
    >
      <path fill="currentColor" fillRule="evenodd" d={paths[variant]} />
    </svg>
  )
}
