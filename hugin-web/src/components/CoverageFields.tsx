import {
  type CoverageDraft,
  kommunerInFylke,
  removeOtherFylke,
  removeOtherKommune,
  switchFylke,
} from '../coverage'
import { FYLKER, fylkeName, fylkeOf } from '../fylker'
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
 * target (see .coverage-kommune in main.css). Coverage outside the rendered fylke is listed
 * below the cascade with a remove button each — switching fylke moves the current selection
 * there rather than dropping it, so the cascade can build a multi-fylke scope one fylke at a
 * time and a save never narrows what it did not show. */
export function CoverageFields({ idPrefix, draft, onChange, kommuner }: Props) {
  const t = useT()
  const options = kommuner ? kommunerInFylke(kommuner, draft.fylke) : []
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
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-fylke`}>
          {t('companies.fylke')}
        </label>
        <select
          id={`${idPrefix}-fylke`}
          className="select"
          value={draft.fylke}
          onChange={(event) => onChange(switchFylke(draft, event.target.value, kommuner))}
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
        <fieldset className="stack stack-sm coverage-group">
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

      {draft.fylke && hasOthers && (
        <div className="stack stack-sm">
          <p className="help" id={othersLabelId}>
            {t('coverage.othersHint', { fylke: fylkeName(draft.fylke) })}
          </p>
          <ul className="coverage-others" aria-labelledby={othersLabelId}>
            {others.fylker.map((fylke) => (
              <li key={fylke} className="coverage-other">
                {t('coverage.otherFylke', { fylke: fylkeName(fylke) })}
                <button
                  type="button"
                  className="btn btn-ghost icon-btn"
                  aria-label={t('coverage.removeOther', { name: fylkeName(fylke) })}
                  onClick={() => onChange(removeOtherFylke(draft, fylke))}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
            {others.municipalities.map((m) => (
              <li key={m.number} className="coverage-other">
                {m.name} ({fylkeName(fylkeOf(m.number) ?? '')})
                <button
                  type="button"
                  className="btn btn-ghost icon-btn"
                  aria-label={t('coverage.removeOther', { name: m.name })}
                  onClick={() => onChange(removeOtherKommune(draft, m.number))}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
