import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FYLKER } from '../fylker'
import { CoverageFields } from './CoverageFields'

const kommuner = [
  { number: '3405', name: 'Lillehammer' },
  { number: '3403', name: 'Hamar' },
  { number: '3909', name: 'Larvik' },
]

describe('CoverageFields', () => {
  it('renders the fylke select with Hele landet first and no kommuner until a fylke is chosen', () => {
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '', kommuner: [] }}
        onChange={() => {}}
        kommuner={kommuner}
      />
    )

    const options = within(screen.getByLabelText('Fylke')).getAllByRole('option')
    expect(options).toHaveLength(FYLKER.size + 1)
    expect(options[0]).toHaveTextContent('Hele landet')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })

  it('reveals the fylke’s kommuner as a labelled checkbox group and toggles them', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: ['3403'] }}
        onChange={onChange}
        kommuner={kommuner}
      />
    )

    const group = screen.getByRole('group', { name: 'Kommuner i Innlandet' })
    const boxes = within(group).getAllByRole('checkbox')
    expect(
      boxes.map(
        (b) => b.getAttribute('aria-label') ?? (b as HTMLInputElement).labels?.[0]?.textContent
      )
    ).toEqual(['Hamar', 'Lillehammer'])
    expect(within(group).getByRole('checkbox', { name: 'Hamar' })).toBeChecked()

    await user.click(within(group).getByRole('checkbox', { name: 'Lillehammer' }))
    expect(onChange).toHaveBeenCalledWith({ fylke: '34', kommuner: ['3403', '3405'] })

    await user.click(within(group).getByRole('checkbox', { name: 'Hamar' }))
    expect(onChange).toHaveBeenLastCalledWith({ fylke: '34', kommuner: [] })
  })

  it('changing the fylke clears the checked kommuner', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: ['3403'] }}
        onChange={onChange}
        kommuner={kommuner}
      />
    )

    await user.selectOptions(screen.getByLabelText('Fylke'), 'Vestfold')

    expect(onChange).toHaveBeenCalledWith({ fylke: '39', kommuner: [] })
  })

  it('degrades to fylke-only with a hint when the kommune list is unavailable', () => {
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: [] }}
        onChange={() => {}}
        kommuner={null}
      />
    )

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText(/Kommunelisten er ikke tilgjengelig/)).toBeInTheDocument()
  })
})
