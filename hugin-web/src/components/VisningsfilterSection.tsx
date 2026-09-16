import { KNOWN_CATEGORIES, useFocus } from '../focus'
import { useT } from '../i18n'
import { useAnnounce } from './LiveRegion'

/** The Visningsfilter card (spec v3.6 B3): the per-browser render lens. Task 6 adds the region
 * chips and the «Velg områder …» picker above the categories. */
export function VisningsfilterSection() {
  const t = useT()
  const announce = useAnnounce()
  const { focus, setFocus, resetFocus } = useFocus()
  const categories = focus?.categories ?? []

  const toggleCategory = (category: string) => {
    const next = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category]
    setFocus({ regions: focus?.regions ?? [], categories: next })
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
    </section>
  )
}
