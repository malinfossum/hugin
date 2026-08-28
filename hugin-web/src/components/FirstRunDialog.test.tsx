import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FYLKER } from '../fylker'
import { FirstRunDialog } from './FirstRunDialog'

describe('FirstRunDialog', () => {
  it('renders a fylke select ("Hele landet" + 15 fylker) and a categories fieldset', () => {
    render(<FirstRunDialog open onSave={() => {}} onDismiss={() => {}} />)

    const fylkeSelect = screen.getByLabelText('Fylke')
    const options = within(fylkeSelect).getAllByRole('option')
    expect(options).toHaveLength(FYLKER.size + 1)
    expect(options[0]).toHaveTextContent('Hele landet')

    const fieldset = screen.getByRole('group', { name: 'Kategorier' })
    expect(within(fieldset).getAllByRole('checkbox')).toHaveLength(2)
  })

  it('assembles the Focus from the selected fylke and checked categories on Start', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<FirstRunDialog open onSave={onSave} onDismiss={() => {}} />)

    await user.selectOptions(screen.getByLabelText('Fylke'), 'Innlandet')
    await user.click(screen.getByRole('checkbox', { name: 'Utvikling' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      fylke: '34',
      kommune: null,
      categories: ['Utvikling'],
    })
  })

  it('calls onDismiss (not onSave) on a native close, e.g. Escape', () => {
    const onSave = vi.fn()
    const onDismiss = vi.fn()
    render(<FirstRunDialog open onSave={onSave} onDismiss={onDismiss} />)

    screen.getByRole('dialog').dispatchEvent(new Event('close'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
