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

  it('defaults to the primary style with Avbryt first, when variant is omitted', () => {
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Avbryt', 'Slett'])
    expect(screen.getByRole('button', { name: 'Slett' })).toHaveClass('btn-primary')
  })

  it('renders the confirm button as btn-danger when variant is "danger", Avbryt still first', () => {
    render(
      <ConfirmDialog
        open
        title="Slette alt?"
        confirmLabel="Slett alt"
        variant="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Avbryt', 'Slett alt'])
    const confirm = screen.getByRole('button', { name: 'Slett alt' })
    expect(confirm).toHaveClass('btn-danger')
    expect(confirm).not.toHaveClass('btn-primary')
  })

  it('focuses the heading when the dialog opens, not the first focusable child (Task 11 finding 4)', () => {
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <a href="/somewhere">Et sted</a>
      </ConfirmDialog>
    )

    expect(screen.getByRole('heading', { name: 'Slett rad?' })).toHaveFocus()
  })

  it('sets aria-describedby on the confirm button from confirmDescribedBy', () => {
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        confirmDescribedBy="why-disabled"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <p id="why-disabled">Fordi.</p>
      </ConfirmDialog>
    )

    expect(screen.getByRole('button', { name: 'Slett' })).toHaveAttribute(
      'aria-describedby',
      'why-disabled'
    )
  })

  it('leaves aria-describedby absent when confirmDescribedBy is omitted', () => {
    render(
      <ConfirmDialog
        open
        title="Slett rad?"
        confirmLabel="Slett"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Slett' })).not.toHaveAttribute('aria-describedby')
  })

  it('disables the confirm button when confirmDisabled is true, and it stays clickable when omitted', () => {
    const onConfirm = vi.fn()
    const { rerender } = render(
      <ConfirmDialog
        open
        title="Slette alt?"
        confirmLabel="Slett alt"
        confirmDisabled
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Slett alt' })).toBeDisabled()

    rerender(
      <ConfirmDialog
        open
        title="Slette alt?"
        confirmLabel="Slett alt"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Slett alt' })).toBeEnabled()
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
