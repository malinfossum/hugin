import { type CoverageDraft, kommunerInFylke } from '../coverage'
import { FYLKER, fylkeName } from '../fylker'
import { useT } from '../i18n'
import type { KommuneDto } from '../types'

interface Props {
  idPrefix: string
  draft: CoverageDraft
  onChange: (next: CoverageDraft) => void
  /** null = /api/kommuner was unreachable: fylke granularity only, with a hint. */
  kommuner: KommuneDto[] | null
}

const FYLKE_OPTIONS = [...FYLKER.entries()]

/** The fylke → kommune cascade for the SERVER scope (coverage), shared by the first-run dialog
 * and Settings. Fieldset + legend name the group after the fylke; each checkbox row is a ≥44 px
 * target (see .coverage-kommune in main.css). */
export function CoverageFields({ idPrefix, draft, onChange, kommuner }: Props) {
  const t = useT()
  const options = kommuner ? kommunerInFylke(kommuner, draft.fylke) : []

  const toggle = (number: string) => {
    const next = draft.kommuner.includes(number)
      ? draft.kommuner.filter((n) => n !== number)
      : [...draft.kommuner, number]
    onChange({ fylke: draft.fylke, kommuner: next })
  }

  return (
    <>
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-fylke`}>
          {t('companies.fylke')}
        </label>
        <select
          id={`${idPrefix}-fylke`}
          className="select"
          value={draft.fylke}
          onChange={(event) => onChange({ fylke: event.target.value, kommuner: [] })}
        >
          <option value="">{t('focus.allOfNorway')}</option>
          {FYLKE_OPTIONS.map(([number, name]) => (
            <option key={number} value={number}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {draft.fylke && kommuner === null && (
        <p className="help">{t('coverage.kommunerUnavailable')}</p>
      )}

      {draft.fylke && kommuner !== null && (
        <fieldset className="stack stack-sm">
          <legend>{t('coverage.kommunerLegend', { fylke: fylkeName(draft.fylke) })}</legend>
          <p className="help">{t('coverage.kommunerHint')}</p>
          <div className="coverage-kommuner">
            {options.map((k) => (
              <label key={k.number} className="coverage-kommune">
                <input
                  type="checkbox"
                  checked={draft.kommuner.includes(k.number)}
                  onChange={() => toggle(k.number)}
                />
                {k.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  )
}
