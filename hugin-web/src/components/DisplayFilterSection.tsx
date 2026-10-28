import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { KNOWN_CATEGORIES, useFocus } from '../context/focus'
import { useT } from '../i18n'
import { kommunerQuery } from '../lib/queries'
import type { Region } from '../lib/regions'
import { AreaPickerDialog } from './AreaPickerDialog'
import { useAnnounce } from './LiveRegion'
import { RegionChips } from './RegionChips'
import { SettingsSection } from './SettingsSection'
import { Button } from './ui/button'
import { toast } from './ui/toast'

/** Stable empty list for a null focus, so the picker's `value` identity does not change on
 * every render. */
const NO_REGIONS: Region[] = []

/** The Visningsfilter card (spec v3.6 B3): the per-browser render lens. The chips summarise it,
 * ✕ applies at once, «Velg områder …» opens the picker, which works on a draft (Bruk/Avbryt).
 * This section reads the (shared, cached) kommune list and hands it to both the chips (as a name
 * map) and the dialog. A failed fetch means numbers in the chips and fylke-only ticking in the dialog. */
export function DisplayFilterSection() {
  const t = useT()
  const announce = useAnnounce()
  const { focus, setFocus, resetFocus } = useFocus()
  const { data: kommunerList, isError: kommunerFailed } = useQuery(kommunerQuery())
  const kommuner = kommunerFailed ? null : kommunerList
  const [pickerOpen, setPickerOpen] = useState(false)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const regions = focus?.regions ?? NO_REGIONS
  const categories = focus?.categories ?? []

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
    toast.add({ type: 'success', title: t('settings.focusResetDone') })
  }

  return (
    <SettingsSection
      headingId="settings-focus-heading"
      title={t('settings.focusHeading')}
      hint={t('settings.focusHint')}
    >
      <RegionChips
        regions={regions}
        kommuneNames={kommuneNames}
        onRemove={(fylke) => applyRegions(regions.filter((r) => r.fylke !== fylke))}
        fallbackFocusRef={chooseRef}
      />
      <Button
        variant="outline"
        size="touch"
        className="self-start"
        ref={chooseRef}
        onClick={() => setPickerOpen(true)}
      >
        <MapPin aria-hidden="true" />
        {t('areas.choose')}
      </Button>

      <fieldset className="m-0 mt-4 flex min-w-0 flex-col border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium text-foreground">
          {t('focus.categoriesLegend')}
        </legend>
        <p className="text-small text-muted-foreground">{t('focus.categoriesHint')}</p>
        {KNOWN_CATEGORIES.map((category) => (
          <label
            key={category}
            className="flex min-h-11 items-center gap-2.5 text-body-sm text-foreground"
          >
            <input
              type="checkbox"
              className="size-4.5"
              checked={categories.includes(category)}
              onChange={() => toggleCategory(category)}
            />
            {category}
          </label>
        ))}
      </fieldset>

      <Button variant="link" className="-ms-2.5 min-h-11 self-start" onClick={handleReset}>
        {t('settings.focusReset')}
      </Button>

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
    </SettingsSection>
  )
}
