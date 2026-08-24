import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { displayCompanyName } from '../companyName'
import { useAnnounce } from '../components/LiveRegion'
import { formatDate } from '../dates'
import { localeFor, type TranslationKey, useLang, useT } from '../i18n'
import { pipelineLabel } from '../pipelineLabels'
import type { PipelineDto, PipelineStatusSlug, TrackResponse } from '../types'

const SECTIONS: PipelineStatusSlug[] = ['active', 'applied', 'answered']

type SortMode = 'starred' | 'updated' | 'name'

const SORT_OPTION_KEYS: { value: SortMode; labelKey: TranslationKey }[] = [
  { value: 'starred', labelKey: 'applications.sortStarred' },
  { value: 'updated', labelKey: 'applications.sortUpdated' },
  { value: 'name', labelKey: 'applications.sortName' },
]

const SORT_STORAGE_KEY = 'hugin-soknader-sortering'

function loadSortMode(): SortMode {
  try {
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY)
    if (stored === 'starred' || stored === 'updated' || stored === 'name') return stored
  } catch {
    /* localStorage unavailable (private mode etc.) — fall back to the default */
  }
  return 'starred'
}

function saveSortMode(mode: SortMode): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, mode)
  } catch {
    /* localStorage unavailable — sort choice just won't persist */
  }
}

function sortEntries(entries: PipelineDto[], mode: SortMode, locale: string): PipelineDto[] {
  const copy = [...entries]
  switch (mode) {
    case 'starred':
      return copy.sort((a, b) => Number(b.starred) - Number(a.starred))
    case 'updated':
      return copy.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    case 'name':
      return copy.sort((a, b) => a.companyName.localeCompare(b.companyName, locale))
  }
}

interface FormState {
  status: PipelineStatusSlug
  why: string
  note: string
  svar: string
}

function toFormState(entry: PipelineDto): FormState {
  return {
    status: entry.status,
    why: entry.why,
    note: entry.note ?? '',
    svar: entry.svar ?? '',
  }
}

export function ApplicationsView() {
  const [entries, setEntries] = useState<PipelineDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingOrgnr, setEditingOrgnr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [warning, setWarning] = useState<{ orgnr: string; message: string } | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode)
  const announce = useAnnounce()
  const t = useT()
  const [lang] = useLang()
  const locale = localeFor(lang)

  const load = useCallback(() => {
    setError(null)
    return api
      .get<PipelineDto[]>('/api/pipeline')
      .then(setEntries)
      .catch(() => setError(t('applications.loadError')))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (entry: PipelineDto) => {
    setEditingOrgnr(entry.orgnr)
    setForm(toFormState(entry))
    setFormError(null)
  }

  const cancelEdit = () => {
    setEditingOrgnr(null)
    setForm(null)
    setFormError(null)
  }

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
    saveSortMode(mode)
  }

  const handleSubmit = async (orgnr: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    setFormError(null)
    let response: TrackResponse
    try {
      response = await api.put<TrackResponse>(`/api/pipeline/${orgnr}`, {
        status: form.status,
        why: form.why,
        note: form.note,
        svar: form.svar,
      })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t('applications.saveError'))
      return
    }
    setWarning(response.warning ? { orgnr, message: response.warning } : null)
    await load()
    setEditingOrgnr(null)
    setForm(null)
    announce(t('applications.saved'))
  }

  const toggleStar = async (entry: PipelineDto) => {
    let response: TrackResponse
    try {
      response = await api.put<TrackResponse>(`/api/pipeline/${entry.orgnr}`, {
        status: entry.status,
        why: entry.why,
        note: entry.note,
        svar: entry.svar,
        starred: !entry.starred,
      })
    } catch (err) {
      announce(err instanceof ApiError ? err.message : t('applications.starError'))
      return
    }
    setWarning(response.warning ? { orgnr: entry.orgnr, message: response.warning } : null)
    await load()
    announce(entry.starred ? t('applications.starRemoved') : t('applications.starSet'))
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          {t('common.retry')}
        </button>
      </p>
    )
  }

  return (
    <div className="applications-view stack stack-lg">
      <div className="field">
        <label className="label" htmlFor="soknader-sortering">
          {t('applications.sortBy')}
        </label>
        <select
          id="soknader-sortering"
          className="select"
          value={sortMode}
          onChange={(event) => handleSortChange(event.target.value as SortMode)}
        >
          {SORT_OPTION_KEYS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {SECTIONS.map((status) => {
        const sectionEntries = sortEntries(
          entries.filter((e) => e.status === status),
          sortMode,
          locale
        )
        const headingId = `pipeline-heading-${status}`
        return (
          <section key={status} aria-labelledby={headingId} className="card stack">
            <h2 id={headingId}>{pipelineLabel(t, status)}</h2>
            {status === 'active' && <p className="muted help">{t('applications.activeHint')}</p>}
            <ul className="stack stack-sm">
              {sectionEntries.map((entry) => {
                const missingWhy = status !== 'active' && !entry.why
                const isEditing = editingOrgnr === entry.orgnr
                return (
                  <li key={entry.orgnr} className="panel stack stack-sm">
                    <div className="cluster cluster-sm cluster-between">
                      <span className="text-strong">{displayCompanyName(entry.companyName)}</span>
                      <button
                        type="button"
                        className="btn btn-ghost icon-btn"
                        aria-pressed={entry.starred}
                        aria-label={
                          entry.starred ? t('applications.starRemove') : t('applications.starGive')
                        }
                        onClick={() => toggleStar(entry)}
                      >
                        <span aria-hidden="true">{entry.starred ? '★' : '☆'}</span>
                      </button>
                    </div>
                    {!isEditing && (
                      <>
                        <div className="cluster cluster-sm">
                          {missingWhy ? (
                            <span className="badge badge-warning">
                              {t('applications.missingWhy')}
                            </span>
                          ) : (
                            entry.why && <span className="text-muted">{entry.why}</span>
                          )}
                          {entry.note && <span className="text-muted">{entry.note}</span>}
                          {entry.svar && <span className="text-muted">{entry.svar}</span>}
                          <span className="help">{formatDate(entry.updated)}</span>
                        </div>
                        {warning?.orgnr === entry.orgnr && (
                          <p role="status" className="badge badge-warning">
                            ⚠ {warning.message}
                          </p>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => startEdit(entry)}
                        >
                          {t('applications.edit')}
                        </button>
                      </>
                    )}
                    {isEditing && form && (
                      <form
                        className="stack stack-sm"
                        onSubmit={(event) => handleSubmit(entry.orgnr, event)}
                      >
                        <div className="field">
                          <label className="label" htmlFor={`status-${entry.orgnr}`}>
                            {t('common.status')}
                          </label>
                          <select
                            id={`status-${entry.orgnr}`}
                            className="select"
                            value={form.status}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                status: event.target.value as PipelineStatusSlug,
                              })
                            }
                          >
                            {SECTIONS.map((slug) => (
                              <option key={slug} value={slug}>
                                {pipelineLabel(t, slug)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label className="label" htmlFor={`why-${entry.orgnr}`}>
                            {t('applications.why')}
                          </label>
                          <textarea
                            id={`why-${entry.orgnr}`}
                            className="textarea"
                            value={form.why}
                            onChange={(event) => setForm({ ...form, why: event.target.value })}
                          />
                        </div>

                        <div className="field">
                          <label className="label" htmlFor={`note-${entry.orgnr}`}>
                            {t('applications.note')}
                          </label>
                          <input
                            id={`note-${entry.orgnr}`}
                            className="input"
                            type="text"
                            value={form.note}
                            onChange={(event) => setForm({ ...form, note: event.target.value })}
                          />
                        </div>

                        <div className="field">
                          <label className="label" htmlFor={`svar-${entry.orgnr}`}>
                            {t('applications.answer')}
                          </label>
                          <input
                            id={`svar-${entry.orgnr}`}
                            className="input"
                            type="text"
                            value={form.svar}
                            onChange={(event) => setForm({ ...form, svar: event.target.value })}
                          />
                        </div>

                        {formError && (
                          <p role="status" className="alert alert-danger">
                            {formError}
                          </p>
                        )}

                        <div className="cluster cluster-sm">
                          <button type="submit" className="btn btn-primary">
                            {t('common.save')}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                            {t('common.cancel')}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
