import { type ReactNode, useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
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
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleClose = () => {
    if (openRef.current) onCancel()
  }

  return (
    <dialog ref={ref} onClose={handleClose} aria-label={title}>
      <h2>{title}</h2>
      {children}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          Avbryt
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
