import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FYLKER } from '../fylker'
import type { Region } from '../regions'
import type { KommuneDto } from '../types'
import { AreaPickerDialog, searchKey } from './AreaPickerDialog'
import { LiveRegionProvider } from './LiveRegion'

const INNLANDET: KommuneDto[] = [
  { number: '3403', name: 'Hamar' },
  { number: '3405', name: 'Lillehammer' },
  { number: '3407', name: 'Gjøvik' },
  { number: '3411', name: 'Ringsaker' },
]
const VESTFOLD: KommuneDto[] = [
  { number: '3905', name: 'Tønsberg' },
  { number: '3907', name: 'Sandefjord' },
]
const KOMMUNER = [...INNLANDET, ...VESTFOLD]

function renderDialog(
  props: Partial<{
    open: boolean
    value: Region[]
    kommuner: KommuneDto[] | null | undefined
  }> = {}
) {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  const utils = render(
    <LiveRegionProvider>
      <AreaPickerDialog
        open={props.open ?? true}
        value={props.value ?? []}
        kommuner={'kommuner' in props ? props.kommuner : KOMMUNER}
        onApply={onApply}
        onCancel={onCancel}
      />
    </LiveRegionProvider>
  )
  return { ...utils, onApply, onCancel }
}

const fylkeBox = (name: string) => screen.getByRole('checkbox', { name })
const disclosure = (fylke: string) =>
  screen.getByRole('button', { name: new RegExp(`kommuner i ${fylke}$`) })
const liveRegion = () => document.querySelector('[aria-live="polite"]')

describe('searchKey', () => {
  it('folds case and Norwegian letters', () => {
    expect(searchKey('Gjøvik')).toBe('gjovik')
    expect(searchKey('Åsnes')).toBe('asnes')
    expect(searchKey('Være')).toBe('vaere')
  })
})

describe('AreaPickerDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists every fylke in FYLKER order with a named tick box and disclosure, heading focused', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Velg områder' })
    expect(screen.getByRole('heading', { name: 'Velg områder' })).toHaveFocus()
    const boxes = within(dialog).getAllByRole('checkbox')
    expect(boxes).toHaveLength(FYLKER.size)
    // The label wraps only the input and the fylke name, so its text IS the name.
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([...FYLKER.values()])
    expect(disclosure('Innlandet')).toHaveAttribute('aria-expanded', 'false')
    expect(fylkeBox('Innlandet')).toHaveAccessibleDescription('4 kommuner')
  })

  it('ticking a fylke makes it whole; Bruk applies it', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog()

    await user.click(fylkeBox('Innlandet'))

    expect(fylkeBox('Innlandet')).toBeChecked()
    expect(fylkeBox('Innlandet')).toHaveAccessibleDescription('hele fylket')
    await user.click(screen.getByRole('button', { name: 'Bruk' }))
    expect(onApply).toHaveBeenCalledWith([{ fylke: '34', kommuner: [] }])
  })

  it('the disclosure expands the kommune list, named and wired with aria-controls', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(disclosure('Innlandet'))

    const button = screen.getByRole('button', { name: 'Skjul kommuner i Innlandet' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const list = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(list).not.toBeNull()
    expect(
      within(list as HTMLElement)
        .getAllByRole('checkbox')
        .map((b) => b.closest('label')?.textContent)
    ).toEqual(['Gjøvik', 'Hamar', 'Lillehammer', 'Ringsaker'])
  })

  it('ticking a kommune narrows the fylke: mixed box, «1 av 4 valgt», applied as a narrowed region', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog()

    await user.click(disclosure('Innlandet'))
    await user.click(screen.getByRole('checkbox', { name: 'Hamar' }))

    expect(fylkeBox('Innlandet')).toBePartiallyChecked()
    expect(fylkeBox('Innlandet')).toHaveAccessibleDescription('1 av 4 valgt')
    await user.click(screen.getByRole('button', { name: 'Bruk' }))
    expect(onApply).toHaveBeenCalledWith([{ fylke: '34', kommuner: ['3403'] }])
  })

  it('unticking the last kommune leaves the whole fylke — the box goes from mixed to checked', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({ value: [{ fylke: '34', kommuner: ['3403'] }] })

    expect(fylkeBox('Innlandet')).toBePartiallyChecked()
    await user.click(disclosure('Innlandet'))
    expect(screen.getByRole('checkbox', { name: 'Hamar' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Hamar' }))

    expect(fylkeBox('Innlandet')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Bruk' }))
    expect(onApply).toHaveBeenCalledWith([{ fylke: '34', kommuner: [] }])
  })

  it('clicking a mixed fylke box makes the fylke whole and clears its kommuner', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({ value: [{ fylke: '34', kommuner: ['3403', '3405'] }] })

    await user.click(fylkeBox('Innlandet'))

    expect(fylkeBox('Innlandet')).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Bruk' }))
    expect(onApply).toHaveBeenCalledWith([{ fylke: '34', kommuner: [] }])
  })

  it('unticking a whole fylke removes it', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({
      value: [
        { fylke: '34', kommuner: [] },
        { fylke: '39', kommuner: [] },
      ],
    })

    await user.click(fylkeBox('Innlandet'))

    await user.click(screen.getByRole('button', { name: 'Bruk' }))
    expect(onApply).toHaveBeenCalledWith([{ fylke: '39', kommuner: [] }])
  })

  it('search hides rows without hits, expands hits to the matching kommuner, and announces the count', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Søk fylke eller kommune'), 'ham')

    expect(
      screen.getAllByRole('listitem').filter((li) => li.classList.contains('area-fylke'))
    ).toHaveLength(1)
    expect(fylkeBox('Innlandet')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Vestfold' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Hamar' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Lillehammer' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Gjøvik' })).not.toBeInTheDocument()
    await waitFor(() => expect(liveRegion()).toHaveTextContent('2 treff'))

    await user.clear(screen.getByLabelText('Søk fylke eller kommune'))

    expect(screen.getByRole('checkbox', { name: 'Vestfold' })).toBeInTheDocument()
    expect(disclosure('Innlandet')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('checkbox', { name: 'Hamar' })).not.toBeInTheDocument()
  })

  it('a fylke-name hit lists all of that fylke’s kommuner, diacritic-insensitively', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(screen.getByLabelText('Søk fylke eller kommune'), 'vestf')

    expect(screen.queryByRole('checkbox', { name: 'Innlandet' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Tønsberg' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Sandefjord' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Søk fylke eller kommune'))
    await user.type(screen.getByLabelText('Søk fylke eller kommune'), 'tons')

    expect(screen.getByRole('checkbox', { name: 'Tønsberg' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Sandefjord' })).not.toBeInTheDocument()
  })

  it('Esc in a non-empty search field only clears the query; the next Esc cancels', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderDialog()
    const search = screen.getByLabelText('Søk fylke eller kommune')

    await user.type(search, 'ham')
    await user.keyboard('{Escape}')

    expect(search).toHaveValue('')
    expect(onCancel).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Esc elsewhere in the dialog cancels', async () => {
    const user = userEvent.setup()
    const { onCancel, onApply } = renderDialog()

    await user.click(fylkeBox('Innlandet'))
    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('Avbryt cancels without applying', async () => {
    const user = userEvent.setup()
    const { onCancel, onApply } = renderDialog()

    await user.click(fylkeBox('Vestfold'))
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('reopening seeds the draft from value again — a cancelled edit is gone', async () => {
    const user = userEvent.setup()
    const { rerender } = renderDialog({ value: [{ fylke: '39', kommuner: [] }] })

    await user.click(fylkeBox('Innlandet'))
    rerender(
      <LiveRegionProvider>
        <AreaPickerDialog
          open={false}
          value={[{ fylke: '39', kommuner: [] }]}
          kommuner={KOMMUNER}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </LiveRegionProvider>
    )
    rerender(
      <LiveRegionProvider>
        <AreaPickerDialog
          open
          value={[{ fylke: '39', kommuner: [] }]}
          kommuner={KOMMUNER}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </LiveRegionProvider>
    )

    expect(fylkeBox('Innlandet')).not.toBeChecked()
    expect(fylkeBox('Vestfold')).toBeChecked()
  })

  it('with the register unreachable: hint once, disclosures disabled, narrowings kept by number, Bruk enabled', async () => {
    const user = userEvent.setup()
    const { onApply } = renderDialog({
      kommuner: null,
      value: [{ fylke: '34', kommuner: ['3403', '3405'] }],
    })

    expect(screen.getAllByText(/Kommunelisten er ikke tilgjengelig/)).toHaveLength(1)
    expect(disclosure('Innlandet')).toBeDisabled()
    expect(fylkeBox('Innlandet')).toBePartiallyChecked()
    expect(fylkeBox('Innlandet')).toHaveAccessibleDescription('2 valgt')
    // Nothing ticked and no register: the count span is present but empty.
    const vestfoldCountId = fylkeBox('Vestfold').getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(vestfoldCountId)?.textContent).toBe('')

    await user.click(fylkeBox('Vestfold'))
    await user.click(screen.getByRole('button', { name: 'Bruk' }))

    expect(onApply).toHaveBeenCalledWith([
      { fylke: '34', kommuner: ['3403', '3405'] },
      { fylke: '39', kommuner: [] },
    ])
  })

  it('while the register is still loading: disclosures disabled, no hint', () => {
    renderDialog({ kommuner: undefined })

    expect(disclosure('Innlandet')).toBeDisabled()
    expect(screen.queryByText(/Kommunelisten er ikke tilgjengelig/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bruk' })).toBeEnabled()
  })

  it('returns focus to the element that opened it', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Velg områder …'
    document.body.append(opener)
    opener.focus()
    const { rerender } = renderDialog({ open: false })
    expect(opener).toHaveFocus()

    rerender(
      <LiveRegionProvider>
        <AreaPickerDialog
          open
          value={[]}
          kommuner={KOMMUNER}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </LiveRegionProvider>
    )
    expect(screen.getByRole('heading', { name: 'Velg områder' })).toHaveFocus()

    rerender(
      <LiveRegionProvider>
        <AreaPickerDialog
          open={false}
          value={[]}
          kommuner={KOMMUNER}
          onApply={() => {}}
          onCancel={() => {}}
        />
      </LiveRegionProvider>
    )
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
