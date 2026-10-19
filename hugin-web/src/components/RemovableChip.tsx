import { X } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { Button } from './ui/button'

interface Props {
  children: ReactNode
  /** The ✕'s accessible name, e.g. «Fjern 62». */
  removeLabel: string
  onRemove: () => void
  removeRef?: Ref<HTMLButtonElement>
  title?: string
}

/** A list item the person can take out again: the select's control shape (sheet fill, strong
 * hairline, 44px) with a ghost ✕ inside that keeps the 44px floor. Render it inside a <ul>. */
export function RemovableChip({ children, removeLabel, onRemove, removeRef, title }: Props) {
  return (
    <li
      className="inline-flex h-11 items-center rounded-lg border border-input bg-card ps-3 text-sm font-medium text-foreground"
      title={title}
    >
      {children}
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11"
        aria-label={removeLabel}
        ref={removeRef}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  )
}
