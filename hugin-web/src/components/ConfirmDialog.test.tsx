import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

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
