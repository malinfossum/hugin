import { type ReactNode, useEffect, useRef } from 'react'
import { useT } from '../i18n'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  /** Keeps the confirm button disabled — the typed-confirmation gate on a destructive action
   * (ResetSection's hard reset). Defaults to enabled, so every existing caller is unaffected. */
  confirmDisabled?: boolean
  /** 'danger' styles the confirm button as destructive (ResetSection) instead of the default
   * recommended-action styling. Defaults to 'primary', so every existing caller is unaffected. */
  variant?: 'primary' | 'danger'
  /** Id of an element in `children` that explains why the confirm button is disabled — set as
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
  const ref = useRef<HTMLDialogElement>(null)
  // Now that a dialog can hold a form field (ResetSection's hard reset), showModal()'s default
  // focus would land on the first focusable descendant — that field, or worse, the Eksport link
  // ahead of it — instead of announcing the dialog itself. Mirrors FirstRunDialog's own
  // tabIndex={-1} heading-ref pattern (Task 11 finding 4).
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useT()
  // Latest `open` prop, so the native close handler can tell a user-initiated close
  // (Escape — fires while `open` is still true from the parent's point of view) apart
  // from the close our own effect triggers after the parent already flipped `open` to
  // false in response to onConfirm/onCancel. Without this, dialog.close() below fires
  // a native 'close' event that would call onCancel a second time — even after confirm.
  const openRef = useRef(open)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    openRef.current = open
    if (open && !dialog.open) {
      dialog.showModal()
      headingRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleClose = () => {
    if (openRef.current) onCancel()
  }

  return (
    <dialog ref={ref} className="modal stack" onClose={handleClose} aria-label={title}>
      <h2 ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {children}
      <div className="dialog-actions cluster cluster-sm">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`btn btn-${variant === 'danger' ? 'danger' : 'primary'}`}
          disabled={confirmDisabled}
          aria-describedby={confirmDescribedBy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
