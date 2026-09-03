import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NO_OTHERS } from '../coverage'
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
        draft={{ fylke: '', kommuner: [], others: NO_OTHERS }}
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
        draft={{ fylke: '34', kommuner: ['3403'], others: NO_OTHERS }}
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
    expect(onChange).toHaveBeenCalledWith({
      fylke: '34',
      kommuner: ['3403', '3405'],
      others: NO_OTHERS,
    })

    await user.click(within(group).getByRole('checkbox', { name: 'Hamar' }))
    expect(onChange).toHaveBeenLastCalledWith({ fylke: '34', kommuner: [], others: NO_OTHERS })
  })

  it('changing the fylke moves the checked kommuner to the also-covered list', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: ['3403'], others: NO_OTHERS }}
        onChange={onChange}
        kommuner={kommuner}
      />
    )

    await user.selectOptions(screen.getByLabelText('Fylke'), 'Vestfold')

    expect(onChange).toHaveBeenCalledWith({
      fylke: '39',
      kommuner: [],
      others: { municipalities: [{ name: 'Hamar', number: '3403' }], fylker: [] },
    })
  })

  it('lists coverage outside the rendered fylke with a remove button each', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const others = { municipalities: [{ name: 'Larvik', number: '3909' }], fylker: ['03'] }
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: [], others }}
        onChange={onChange}
        kommuner={kommuner}
      />
    )

    const list = screen.getByRole('list', { name: 'Dekkes også, utenfor Innlandet' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Oslo (hele fylket)')
    expect(items[1]).toHaveTextContent('Larvik (Vestfold)')

    await user.click(within(list).getByRole('button', { name: 'Fjern Larvik' }))
    expect(onChange).toHaveBeenCalledWith({
      fylke: '34',
      kommuner: [],
      others: { municipalities: [], fylker: ['03'] },
    })

    await user.click(within(list).getByRole('button', { name: 'Fjern Oslo' }))
    expect(onChange).toHaveBeenLastCalledWith({
      fylke: '34',
      kommuner: [],
      others: { municipalities: [{ name: 'Larvik', number: '3909' }], fylker: [] },
    })
  })

  it('shows no also-covered list under Hele landet', () => {
    render(
      <CoverageFields
        idPrefix="t"
        draft={{
          fylke: '',
          kommuner: [],
          others: { municipalities: [{ name: 'Larvik', number: '3909' }], fylker: [] },
        }}
        onChange={() => {}}
        kommuner={kommuner}
      />
    )

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('degrades to fylke-only with a hint when the kommune list is unavailable', () => {
    render(
      <CoverageFields
        idPrefix="t"
        draft={{ fylke: '34', kommuner: [], others: NO_OTHERS }}
        onChange={() => {}}
        kommuner={null}
      />
    )

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText(/Kommunelisten er ikke tilgjengelig/)).toBeInTheDocument()
  })
})
