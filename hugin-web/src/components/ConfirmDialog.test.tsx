import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

// Mirrors real controlled usage: the parent flips `open` to false from inside
// onConfirm/onCancel, which is exactly the scenario that can double-fire onCancel
// via the dialog's native close event.
function ControlledWrapper({
  onConfirmSpy,
  onCancelSpy,
}: {
  onConfirmSpy: () => void
  onCancelSpy: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      title="Slett rad?"
      confirmLabel="Slett"
      onConfirm={() => {
        onConfirmSpy()
        setOpen(false)
      }}
      onCancel={() => {
        onCancelSpy()
        setOpen(false)
      }}
    />
  )
}

describe('ConfirmDialog', () => {
  it('shows the dialog open when open is true', () => {
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Slett rad?' })).toBeVisible()
  })

  it('fires onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Slett' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('fires onCancel when Avbryt is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmDialog controlled close (regression)', () => {
  it('does not double-fire onCancel after a controlled confirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ControlledWrapper onConfirmSpy={onConfirm} onCancelSpy={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Slett' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(0)
  })

  it('fires onCancel exactly once for a controlled cancel', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ControlledWrapper onConfirmSpy={onConfirm} onCancelSpy={onCancel} />)

    await user.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('fires onCancel once for a native close (e.g. Escape) while still open', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ControlledWrapper onConfirmSpy={onConfirm} onCancelSpy={onCancel} />)

    const dialog = screen.getByRole('dialog', { name: 'Slett rad?' })
    dialog.dispatchEvent(new Event('close'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
