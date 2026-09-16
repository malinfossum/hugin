import {
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FYLKER, fylkeOf } from '../fylker'
import { useT } from '../i18n'
import {
  normalizeRegions,
  type Region,
  regionFor,
  tickFylke,
  tickKommune,
  untickFylke,
  untickKommune,
} from '../regions'
import type { KommuneDto } from '../types'
import { useAnnounce } from './LiveRegion'

interface Props {
  open: boolean
  value: Region[]
  /** undefined = /api/kommuner has not answered yet, null = unreachable, list = ready — the
   * CoverageFields contract. The dialog never fetches; the view owns the one request. */
  kommuner: KommuneDto[] | null | undefined
  onApply: (regions: Region[]) => void
  onCancel: () => void
}

/** Case- and diacritic-insensitive search key. NFD strips combining marks (å → a); ø and æ do
 * not decompose, so they are mapped by hand. */
export function searchKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
}

/** The Visningsfilter editor (spec v3.6 B1). Renders nothing while closed; the panel below
 * mounts on open, so its draft, search and expand state are seeded fresh every time. */
export function AreaPickerDialog(props: Props) {
  if (!props.open) return null
  return <AreaPickerPanel {...props} />
}

function AreaPickerPanel({ value, kommuner, onApply, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [draft, setDraft] = useState<Region[]>(() => value)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const t = useT()
  const announce = useAnnounce()
  const idPrefix = useId()

  // showModal on mount, heading takes focus; on unmount focus goes back to whatever had it
  // when the dialog opened (the «Velg områder …» button). Browsers do the latter themselves
  // for a dialog closed with close(), but this panel unmounts instead, so do it by hand.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.showModal()
    headingRef.current?.focus()
    return () => opener?.focus()
  }, [])

  const listReady = Array.isArray(kommuner)
  const byFylke = useMemo(() => {
    const map = new Map<string, KommuneDto[]>()
    for (const k of kommuner ?? []) {
      const fylke = fylkeOf(k.number)
      if (!fylke) continue
      const list = map.get(fylke) ?? []
      list.push(k)
      map.set(fylke, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'nb'))
    return map
  }, [kommuner])

  const key = searchKey(query.trim())
  const searching = key !== ''
  const rows = [...FYLKER.entries()].map(([fylke, name]) => {
    const all = byFylke.get(fylke) ?? []
    const fylkeHit = searching && searchKey(name).includes(key)
    const kommuneHits = searching ? all.filter((k) => searchKey(k.name).includes(key)) : []
    const visible = !searching || fylkeHit || kommuneHits.length > 0
    return {
      fylke,
      name,
      all,
      listed: searching && !fylkeHit ? kommuneHits : all,
      visible,
      isExpanded: searching ? visible : expanded.has(fylke),
      hits: (fylkeHit ? 1 : 0) + kommuneHits.length,
    }
  })
  const hitCount = rows.reduce((n, row) => n + row.hits, 0)

  useEffect(() => {
    if (searching) announce(t('areas.hits', { n: hitCount }))
  }, [searching, hitCount, announce, t])

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault() // no native cancel on top of this
    onCancel()
  }

  // Chrome clears type="search" on Esc and the keydown would still reach the dialog, throwing
  // the draft away. With a query: clear it here and stop. Without one, Esc cancels as usual.
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || query === '') return
    event.preventDefault()
    event.stopPropagation()
    setQuery('')
  }

  const handleNativeCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    onCancel()
  }

  const toggleExpanded = (fylke: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(fylke)) next.delete(fylke)
      else next.add(fylke)
      return next
    })

  const countText = (row: (typeof rows)[number], region: Region | undefined): string => {
    if (region && region.kommuner.length === 0) return t('areas.wholeFylke')
    if (region) {
      return listReady
        ? t('areas.selectedOfTotal', { n: region.kommuner.length, total: row.all.length })
        : t('areas.selected', { n: region.kommuner.length })
    }
    return listReady ? t('areas.kommuneCount', { n: row.all.length }) : ''
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal area-picker"
      aria-labelledby={`${idPrefix}-title`}
      onKeyDown={handleDialogKeyDown}
      onCancel={handleNativeCancel}
    >
      <h2 id={`${idPrefix}-title`} ref={headingRef} tabIndex={-1}>
        {t('areas.dialogTitle')}
      </h2>

      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-search`}>
          {t('areas.searchLabel')}
        </label>
        <input
          id={`${idPrefix}-search`}
          className="input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {kommuner === null && <p className="help">{t('coverage.kommunerUnavailable')}</p>}

      <ul className="area-picker-body stack stack-sm">
        {rows
          .filter((row) => row.visible)
          .map((row) => {
            const region = regionFor(draft, row.fylke)
            const whole = region !== undefined && region.kommuner.length === 0
            const mixed = region !== undefined && region.kommuner.length > 0
            const boxId = `${idPrefix}-${row.fylke}`
            const countId = `${boxId}-count`
            const listId = `${boxId}-list`
            return (
              <li key={row.fylke} className="area-fylke">
                <div className="area-fylke-row">
                  <label className="area-fylke-label" htmlFor={boxId}>
                    <input
                      id={boxId}
                      type="checkbox"
                      checked={whole}
                      aria-describedby={countId}
                      ref={(el) => {
                        if (el) el.indeterminate = mixed
                      }}
                      onChange={() =>
                        setDraft(
                          whole ? untickFylke(draft, row.fylke) : tickFylke(draft, row.fylke)
                        )
                      }
                    />
                    {row.name}
                  </label>
                  <span id={countId} className="text-muted area-fylke-count">
                    {countText(row, region)}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn"
                    aria-expanded={row.isExpanded}
                    aria-controls={listId}
                    aria-label={t(row.isExpanded ? 'areas.hideKommuner' : 'areas.showKommuner', {
                      fylke: row.name,
                    })}
                    disabled={!listReady || searching}
                    onClick={() => toggleExpanded(row.fylke)}
                  >
                    <span aria-hidden="true">{row.isExpanded ? '▴' : '▾'}</span>
                  </button>
                </div>
                {row.isExpanded && listReady && (
                  <div id={listId} className="area-kommuner">
                    {row.listed.map((k) => {
                      const ticked = region?.kommuner.includes(k.number) ?? false
                      return (
                        <label key={k.number} className="coverage-kommune">
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() =>
                              setDraft(
                                ticked
                                  ? untickKommune(draft, k.number)
                                  : tickKommune(draft, k.number)
                              )
                            }
                          />
                          {k.name}
                        </label>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
      </ul>

      <div className="dialog-actions cluster cluster-sm">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onApply(normalizeRegions(draft))}
        >
          {t('areas.apply')}
        </button>
      </div>
    </dialog>
  )
}
