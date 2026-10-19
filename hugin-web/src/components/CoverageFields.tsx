import { useT } from '../i18n'
import {
  type CoverageDraft,
  kommunerInFylke,
  removeOtherFylke,
  removeOtherKommune,
  switchFylke,
} from '../lib/coverage'
import { FYLKER, fylkeName, fylkeOf } from '../lib/fylker'
import type { KommuneDto } from '../lib/types'
import { RemovableChip } from './RemovableChip'
import { NativeSelect, NativeSelectOption } from './ui/native-select'

interface Props {
  idPrefix: string
  draft: CoverageDraft
  onChange: (next: CoverageDraft) => void
  /** undefined = /api/kommuner has not answered yet (nothing under the select, the parent
   * keeps Save disabled); null = it was unreachable: fylke granularity only, with a hint. */
  kommuner: KommuneDto[] | null | undefined
  /** Shown as the select's value until a region is chosen. All of Norway is the empty value
   * and the widest scope, so a dialog asking for a first choice must not open on it. */
  placeholder?: string
}

const UNCHOSEN = 'unchosen'

const FYLKE_OPTIONS = [...FYLKER.entries()]

/** The fylke → kommune cascade for the SERVER scope (coverage), shared by the first-run dialog
 * and Settings. Fieldset + legend name the group after the fylke; each checkbox row is a ≥44 px
 * target. Coverage outside the rendered fylke is listed
 * below the cascade with a remove button each. Switching fylke moves the current selection
 * there rather than dropping it, so the cascade can build a multi-fylke scope one fylke at a
 * time and a save never narrows what it did not show. */
export function CoverageFields({ idPrefix, draft, onChange, kommuner, placeholder }: Props) {
  const t = useT()
  const options = kommuner ? kommunerInFylke(kommuner, draft.fylke) : []
  const loading = kommuner === undefined
  const { others } = draft
  const hasOthers = others.municipalities.length > 0 || others.fylker.length > 0
  const othersLabelId = `${idPrefix}-others`

  const toggle = (number: string) => {
    const next = draft.kommuner.includes(number)
      ? draft.kommuner.filter((n) => n !== number)
      : [...draft.kommuner, number]
    onChange({ ...draft, kommuner: next })
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-fylke`} className="text-sm text-muted-foreground">
          {t('companies.fylke')}
        </label>
        <NativeSelect
          id={`${idPrefix}-fylke`}
          size="touch"
          className="w-full md:w-72"
          value={placeholder ? UNCHOSEN : draft.fylke}
          onChange={(event) => onChange(switchFylke(draft, event.target.value, kommuner ?? null))}
        >
          {placeholder && (
            <NativeSelectOption value={UNCHOSEN} disabled>
              {placeholder}
            </NativeSelectOption>
          )}
          <NativeSelectOption value="">{t('focus.allOfNorway')}</NativeSelectOption>
          {FYLKE_OPTIONS.map(([number, name]) => (
            <NativeSelectOption key={number} value={number}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      {draft.fylke && !loading && kommuner === null && (
        <p className="text-small text-muted-foreground">{t('coverage.kommunerUnavailable')}</p>
      )}

      {draft.fylke && !loading && kommuner !== null && (
        // The fieldset is the semantic group for the checkboxes, not a boxed section.
        <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
          <legend className="p-0 text-sm font-medium text-foreground">
            {t('coverage.kommunerLegend', { fylke: fylkeName(draft.fylke) })}
          </legend>
          <p className="text-small text-muted-foreground">{t('coverage.kommunerHint')}</p>
          <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((k) => (
              <label
                key={k.number}
                className="flex min-h-11 items-center gap-2.5 text-body-sm text-foreground"
              >
                <input
                  type="checkbox"
                  className="size-4.5"
                  checked={draft.kommuner.includes(k.number)}
                  onChange={() => toggle(k.number)}
                />
                {k.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {draft.fylke && hasOthers && (
        <div className="flex flex-col gap-2">
          <p className="text-small text-muted-foreground" id={othersLabelId}>
            {t('coverage.othersHint', { fylke: fylkeName(draft.fylke) })}
          </p>
          {/* Coverage outside the shown fylke stays visible and removable, so a save never
          narrows what the cascade did not show. */}
          <ul className="flex list-none flex-wrap gap-2 ps-0" aria-labelledby={othersLabelId}>
            {others.fylker.map((fylke) => (
              <RemovableChip
                key={fylke}
                removeLabel={t('coverage.removeOther', { name: fylkeName(fylke) })}
                onRemove={() => onChange(removeOtherFylke(draft, fylke))}
              >
                {t('coverage.otherFylke', { fylke: fylkeName(fylke) })}
              </RemovableChip>
            ))}
            {others.municipalities.map((m) => (
              <RemovableChip
                key={m.number}
                removeLabel={t('coverage.removeOther', { name: m.name })}
                onRemove={() => onChange(removeOtherKommune(draft, m.number))}
              >
                {m.name} ({fylkeName(fylkeOf(m.number) ?? '')})
              </RemovableChip>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
