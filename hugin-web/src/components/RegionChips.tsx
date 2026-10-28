import { type RefObject, useEffect, useRef } from 'react'
import { useT } from '../i18n'
import { fylkeName } from '../lib/fylker'
import type { Region } from '../lib/regions'
import { RemovableChip } from './RemovableChip'

interface Props {
  regions: Region[]
  /** kommunenummer → name. Callers pass what they have (the register in Settings, the loaded
   * companies in Bedrifter); anything unknown shows by number. */
  kommuneNames?: ReadonlyMap<string, string>
  /** With it, every chip carries a ✕. Without it the chips are read-only (Bedrifter). */
  onRemove?: (fylke: string) => void
  /** Where focus goes after the last chip's ✕: the caller's «Velg områder …» button. */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/** Above this many kommuner a chip shows the first SHOWN plus «+n». */
const COLLAPSE_ABOVE = 4
const SHOWN_WHEN_COLLAPSED = 3

/** A region's text. A collapsed one shows the short form and gives screen readers the full one. */
function RegionLabel({ full, short }: { full: string; short: string | null }) {
  if (short === null) return <span>{full}</span>
  return (
    <span>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  )
}

/** The Visningsfilter summary (spec v3.6 B2): one chip per region, «Innlandet: Hamar, Gjøvik»
 * or «Vestfold: hele fylket», «Hele Norge» when there are none. The ✕ that had focus unmounts
 * with its chip, so focus is moved by hand through a pending ref applied after the list
 * re-renders (the DeadlineList pattern): next chip, else previous, else the fallback. */
export function RegionChips({ regions, kommuneNames, onRemove, fallbackFocusRef }: Props) {
  const t = useT()
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // undefined: no move pending. string: focus that fylke's ✕. null: focus the fallback.
  const pendingFocus = useRef<string | null | undefined>(undefined)

  // biome-ignore lint/correctness/useExhaustiveDependencies: regions is the re-render signal that applies the pending focus move
  useEffect(() => {
    if (pendingFocus.current === undefined) return
    const target = pendingFocus.current
    pendingFocus.current = undefined
    const button = target ? removeRefs.current.get(target) : undefined
    if (button) button.focus()
    else fallbackFocusRef?.current?.focus()
  }, [regions])

  const remove = (index: number) => {
    const neighbour = regions[index + 1] ?? regions[index - 1]
    pendingFocus.current = neighbour ? neighbour.fylke : null
    onRemove?.(regions[index].fylke)
  }

  if (regions.length === 0)
    return <p className="text-sm text-muted-foreground">{t('areas.wholeCountry')}</p>

  // Read-only, a chip is plain text: on the sheet only controls get a border. With ✕ it is a
  // RemovableChip.
  return (
    <ul className="flex list-none flex-wrap items-center gap-x-5 gap-y-2 ps-0 text-sm text-foreground">
      {regions.map((region, index) => {
        const fylke = fylkeName(region.fylke)
        const names = region.kommuner
          .map((n) => kommuneNames?.get(n) ?? n)
          .sort((a, b) => a.localeCompare(b, 'nb'))
        const full = `${fylke}: ${names.length === 0 ? t('areas.wholeFylke') : names.join(', ')}`
        const collapsed = names.length > COLLAPSE_ABOVE
        const short = `${fylke}: ${names.slice(0, SHOWN_WHEN_COLLAPSED).join(', ')} ${t('areas.more', { n: names.length - SHOWN_WHEN_COLLAPSED })}`
        return onRemove ? (
          <RemovableChip
            key={region.fylke}
            title={collapsed ? full : undefined}
            removeLabel={t('areas.remove', { fylke })}
            removeRef={(el) => {
              if (el) removeRefs.current.set(region.fylke, el)
              else removeRefs.current.delete(region.fylke)
            }}
            onRemove={() => remove(index)}
          >
            <RegionLabel full={full} short={collapsed ? short : null} />
          </RemovableChip>
        ) : (
          <li
            key={region.fylke}
            className="font-medium text-foreground"
            title={collapsed ? full : undefined}
          >
            <RegionLabel full={full} short={collapsed ? short : null} />
          </li>
        )
      })}
    </ul>
  )
}
