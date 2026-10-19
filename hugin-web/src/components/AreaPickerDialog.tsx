import { ChevronDown } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { FYLKER, fylkeOf } from '../lib/fylker'
import {
  normalizeRegions,
  type Region,
  regionFor,
  tickFylke,
  tickKommune,
  untickFylke,
  untickKommune,
} from '../lib/regions'
import type { KommuneDto } from '../lib/types'
import { useAnnounce } from './LiveRegion'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

interface Props {
  open: boolean
  value: Region[]
  /** undefined = /api/kommuner has not answered yet, null = unreachable, list = ready. This is the
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
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [draft, setDraft] = useState<Region[]>(() => value)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const t = useT()
  const announce = useAnnounce()
  const idPrefix = useId()

  // The heading takes focus on open (initialFocus below); on unmount focus goes back to
  // whatever had it when the dialog opened (the «Velg områder …» button). This panel unmounts
  // rather than closing, so that is done by hand.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
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

  // Chrome clears type="search" on Esc and the keydown would still reach the dialog, throwing
  // the draft away. With a query: clear it here and stop. Without one, Esc cancels as usual.
  // onOpenChange below holds the same line for an Esc the dialog sees first.
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || query === '') return
    event.preventDefault()
    event.stopPropagation()
    setQuery('')
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
    <Dialog
      open
      // Like a native modal, only Cancel, Apply and Esc close it, never a click on the backdrop.
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (next) return
        if (details.reason === 'escape-key' && query !== '') {
          setQuery('')
          return
        }
        onCancel()
      }}
    >
      <DialogContent initialFocus={headingRef} finalFocus={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>
            {t('areas.dialogTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-search`} className="text-sm text-muted-foreground">
            {t('areas.searchLabel')}
          </label>
          <Input
            id={`${idPrefix}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        {kommuner === null && (
          <p className="text-small text-muted-foreground">{t('coverage.kommunerUnavailable')}</p>
        )}

        {/* Only the fylke list scrolls: the search box above and the footer below stay put. */}
        <ul className="-mx-1 flex min-h-0 flex-1 list-none flex-col overflow-y-auto px-1">
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
                <li key={row.fylke} className="border-t border-border first:border-t-0">
                  <div className="flex min-h-11 items-center gap-2">
                    <label
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-body-sm font-medium text-foreground"
                      htmlFor={boxId}
                    >
                      <input
                        id={boxId}
                        type="checkbox"
                        className="size-4.5"
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
                    <span id={countId} className="text-sm text-muted-foreground tabular-nums">
                      {countText(row, region)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      className="size-11"
                      aria-expanded={row.isExpanded}
                      aria-controls={listId}
                      aria-label={t(row.isExpanded ? 'areas.hideKommuner' : 'areas.showKommuner', {
                        fylke: row.name,
                      })}
                      disabled={!listReady || searching}
                      onClick={() => toggleExpanded(row.fylke)}
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={row.isExpanded ? 'rotate-180' : undefined}
                      />
                    </Button>
                  </div>
                  {row.isExpanded && listReady && (
                    <div
                      id={listId}
                      className="grid grid-cols-1 gap-x-4 pb-2 ps-7 sm:grid-cols-2 md:grid-cols-3"
                    >
                      {row.listed.map((k) => {
                        const ticked = region?.kommuner.includes(k.number) ?? false
                        return (
                          <label
                            key={k.number}
                            className="flex min-h-11 items-center gap-2.5 text-body-sm text-foreground"
                          >
                            <input
                              type="checkbox"
                              className="size-4.5"
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

        <DialogFooter>
          <Button variant="ghost" size="touch" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="touch" onClick={() => onApply(normalizeRegions(draft))}>
            {t('areas.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
