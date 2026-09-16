import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { KNOWN_CATEGORIES, useFocus } from '../focus'
import { useT } from '../i18n'
import type { Region } from '../regions'
import type { KommuneDto } from '../types'
import { AreaPickerDialog } from './AreaPickerDialog'
import { useAnnounce } from './LiveRegion'
import { RegionChips } from './RegionChips'

/** Stable empty list for a null focus, so the picker's `value` identity does not change on
 * every render. */
const NO_REGIONS: Region[] = []

/** The Visningsfilter card (spec v3.6 B3): the per-browser render lens. The chips summarise it,
 * ✕ applies at once, «Velg områder …» opens the picker, which works on a draft (Bruk/Avbryt).
 * This section owns the one /api/kommuner fetch and hands the result to both the chips (as a
 * name map) and the dialog, so closing the dialog mid-request cannot touch an unmounted
 * component. A failed fetch means numbers in the chips and fylke-only ticking in the dialog. */
export function VisningsfilterSection() {
  const t = useT()
  const announce = useAnnounce()
  const { focus, setFocus, resetFocus } = useFocus()
  const [kommuner, setKommuner] = useState<KommuneDto[] | null | undefined>(undefined)
  const [pickerOpen, setPickerOpen] = useState(false)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const regions = focus?.regions ?? NO_REGIONS
  const categories = focus?.categories ?? []

  useEffect(() => {
    let cancelled = false
    api
      .get<KommuneDto[]>('/api/kommuner')
      .then((list) => {
        if (!cancelled) setKommuner(list)
      })
      .catch(() => {
        if (!cancelled) setKommuner(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const kommuneNames = useMemo(
    () => new Map((kommuner ?? []).map((k) => [k.number, k.name] as const)),
    [kommuner]
  )

  const applyRegions = (next: Region[]) => {
    setFocus({ regions: next, categories })
    announce(t('settings.focusUpdated'))
  }

  const toggleCategory = (category: string) => {
    const next = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category]
    setFocus({ regions, categories: next })
    announce(t('settings.focusUpdated'))
  }

  const handleReset = () => {
    resetFocus()
    announce(t('settings.focusResetDone'))
  }

  return (
    <section aria-labelledby="settings-focus-heading" className="card settings-group stack">
      <h2 id="settings-focus-heading">{t('settings.focusHeading')}</h2>
      <p className="help">{t('settings.focusHint')}</p>

      <RegionChips
        regions={regions}
        kommuneNames={kommuneNames}
        onRemove={(fylke) => applyRegions(regions.filter((r) => r.fylke !== fylke))}
        fallbackFocusRef={chooseRef}
      />
      <button
        type="button"
        className="btn btn-ghost"
        ref={chooseRef}
        onClick={() => setPickerOpen(true)}
      >
        {t('areas.choose')}
      </button>

      <fieldset className="stack stack-sm">
        <legend>{t('focus.categoriesLegend')}</legend>
        <p className="help">{t('focus.categoriesHint')}</p>
        {KNOWN_CATEGORIES.map((category) => (
          <label key={category} className="cluster cluster-sm">
            <input
              type="checkbox"
              checked={categories.includes(category)}
              onChange={() => toggleCategory(category)}
            />
            {category}
          </label>
        ))}
      </fieldset>

      <button type="button" className="btn btn-ghost" onClick={handleReset}>
        {t('settings.focusReset')}
      </button>

      <AreaPickerDialog
        open={pickerOpen}
        value={regions}
        kommuner={kommuner}
        onApply={(next) => {
          setPickerOpen(false)
          applyRegions(next)
        }}
        onCancel={() => setPickerOpen(false)}
      />
    </section>
  )
}
