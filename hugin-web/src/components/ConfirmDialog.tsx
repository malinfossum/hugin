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

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} onClose={onCancel} aria-label={title}>
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
