import { type ReactNode, useRef } from 'react'
import { useT } from '../i18n'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'
import { Button } from './ui/button'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  /** Keeps the confirm button disabled: the typed-confirmation gate on a destructive action
   * (ResetSection's hard reset). Defaults to enabled, so every existing caller is unaffected. */
  confirmDisabled?: boolean
  /** 'danger' styles the confirm button as destructive (ResetSection) instead of the default
   * recommended-action styling. Defaults to 'primary', so every existing caller is unaffected. */
  variant?: 'primary' | 'danger'
  /** Id of an element in `children` that explains why the confirm button is disabled. Set as
   * the button's `aria-describedby` (ResetSection's hard reset points this at its "Skriv
   * NULLSTILL for å bekrefte" label). Omitted by every other caller, so the attribute is simply
   * absent for them. */
  confirmDescribedBy?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmDisabled,
  variant,
  confirmDescribedBy,
  onConfirm,
  onCancel,
}: Props) {
  // Now that a dialog can hold a form field (ResetSection's hard reset), the default initial
  // focus would land on the first focusable descendant (that field, or worse, the Eksport link
  // ahead of it) instead of announcing the dialog itself (Task 11 finding 4).
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useT()

  return (
    <AlertDialog
      open={open}
      // Only a close the dialog starts itself (Escape) reaches here: Cancel and confirm go
      // through their own handlers, and the parent closing it is not a change event.
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <AlertDialogContent initialFocus={headingRef}>
        <AlertDialogHeader>
          <AlertDialogTitle ref={headingRef} tabIndex={-1}>
            {title}
          </AlertDialogTitle>
        </AlertDialogHeader>
        {children && (
          <div className="flex flex-col gap-3 text-body-sm text-foreground">{children}</div>
        )}
        <AlertDialogFooter>
          <Button variant="ghost" size="touch" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={variant === 'danger' ? 'destructive' : 'default'}
            size="touch"
            disabled={confirmDisabled}
            aria-describedby={confirmDescribedBy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
