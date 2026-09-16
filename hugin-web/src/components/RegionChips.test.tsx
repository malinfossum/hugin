import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Region } from '../regions'
import { RegionChips } from './RegionChips'

const NAMES = new Map([
  ['3403', 'Hamar'],
  ['3405', 'Lillehammer'],
  ['3407', 'Gjøvik'],
  ['3411', 'Ringsaker'],
  ['3413', 'Stange'],
  ['3420', 'Elverum'],
])

/** Stands in for the Settings section: owns the list, and carries the «Velg områder …» button
 * the chips fall back to when the last ✕ goes. */
function Harness({ initial }: { initial: Region[] }) {
  const [regions, setRegions] = useState(initial)
  const chooseRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <RegionChips
        regions={regions}
        kommuneNames={NAMES}
        onRemove={(fylke) => setRegions(regions.filter((r) => r.fylke !== fylke))}
        fallbackFocusRef={chooseRef}
      />
      <button type="button" ref={chooseRef}>
        Velg områder …
      </button>
    </>
  )
}

describe('RegionChips', () => {
  it('names a whole fylke and a narrowed one, kommuner sorted by name', () => {
    render(
      <RegionChips
        regions={[
          { fylke: '34', kommuner: ['3405', '3403'] },
          { fylke: '39', kommuner: [] },
        ]}
        kommuneNames={NAMES}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Innlandet: Hamar, Lillehammer',
      'Vestfold: hele fylket',
    ])
  })

  it('falls back to the number when a name is unknown', () => {
    render(<RegionChips regions={[{ fylke: '34', kommuner: ['3499'] }]} kommuneNames={NAMES} />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Innlandet: 3499')
  })

  it('reads «Hele Norge» for empty regions — no list, no ✕', () => {
    render(<RegionChips regions={[]} onRemove={() => {}} />)
    expect(screen.getByText('Hele Norge')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('collapses more than four kommuner to three plus a count, keeping the full list accessible', () => {
    render(
      <RegionChips
        regions={[{ fylke: '34', kommuner: ['3403', '3405', '3407', '3411', '3413', '3420'] }]}
        kommuneNames={NAMES}
      />
    )
    const chip = screen.getByRole('listitem')
    const full = 'Innlandet: Elverum, Gjøvik, Hamar, Lillehammer, Ringsaker, Stange'
    expect(chip).toHaveAttribute('title', full)
    expect(within(chip).getByText('Innlandet: Elverum, Gjøvik, Hamar +3')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    expect(within(chip).getByText(full)).toHaveClass('visually-hidden')
  })

  it('shows exactly four kommuner without collapsing', () => {
    render(
      <RegionChips
        regions={[{ fylke: '34', kommuner: ['3403', '3405', '3407', '3411'] }]}
        kommuneNames={NAMES}
      />
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Innlandet: Gjøvik, Hamar, Lillehammer, Ringsaker'
    )
    expect(screen.getByRole('listitem')).not.toHaveAttribute('title')
  })

  it('renders no ✕ without onRemove, and a labelled ✕ per chip with it', () => {
    const { rerender } = render(<RegionChips regions={[{ fylke: '34', kommuner: [] }]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    const onRemove = vi.fn()
    rerender(<RegionChips regions={[{ fylke: '34', kommuner: [] }]} onRemove={onRemove} />)
    expect(screen.getByRole('button', { name: 'Fjern Innlandet' })).toBeInTheDocument()
  })

  it('✕ calls onRemove with the fylke', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<RegionChips regions={[{ fylke: '39', kommuner: [] }]} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: 'Fjern Vestfold' }))

    expect(onRemove).toHaveBeenCalledWith('39')
  })

  it("after ✕ on a middle chip, focus moves to the next chip's ✕", async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={[
          { fylke: '03', kommuner: [] },
          { fylke: '34', kommuner: [] },
          { fylke: '39', kommuner: [] },
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Fjern Innlandet' }))

    expect(screen.getByRole('button', { name: 'Fjern Vestfold' })).toHaveFocus()
  })

  it("after ✕ on the last chip, focus moves to the previous chip's ✕", async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={[
          { fylke: '34', kommuner: [] },
          { fylke: '39', kommuner: [] },
        ]}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Fjern Vestfold' }))

    expect(screen.getByRole('button', { name: 'Fjern Innlandet' })).toHaveFocus()
  })

  it('after ✕ on the only chip, focus moves to the fallback («Velg områder …»)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ fylke: '34', kommuner: [] }]} />)

    await user.click(screen.getByRole('button', { name: 'Fjern Innlandet' }))

    expect(screen.getByText('Hele Norge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Velg områder …' })).toHaveFocus()
  })
})
