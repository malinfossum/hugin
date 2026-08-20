import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { useAnnounce } from '../components/LiveRegion'
import { PIPELINE_LABELS } from '../pipelineLabels'
import type { PipelineDto, PipelineStatusSlug, TrackResponse } from '../types'

const SECTIONS: PipelineStatusSlug[] = ['active', 'applied', 'answered']

type SortMode = 'starred' | 'updated' | 'name'

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'starred', label: 'Stjerne først' },
  { value: 'updated', label: 'Sist oppdatert' },
  { value: 'name', label: 'Navn' },
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

function sortEntries(entries: PipelineDto[], mode: SortMode): PipelineDto[] {
  const copy = [...entries]
  switch (mode) {
    case 'starred':
      return copy.sort((a, b) => Number(b.starred) - Number(a.starred))
    case 'updated':
      return copy.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    case 'name':
      return copy.sort((a, b) => a.companyName.localeCompare(b.companyName, 'nb'))
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

function formatUpdated(updated: string): string {
  return new Date(updated).toLocaleDateString('nb-NO')
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

  const load = useCallback(() => {
    setError(null)
    return api
      .get<PipelineDto[]>('/api/pipeline')
      .then(setEntries)
      .catch(() => setError('Kunne ikke laste pipeline.'))
  }, [])

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
      setFormError(err instanceof ApiError ? err.message : 'Kunne ikke lagre.')
      return
    }
    setWarning(response.warning ? { orgnr, message: response.warning } : null)
    await load()
    setEditingOrgnr(null)
    setForm(null)
    announce('Lagret.')
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
      announce(err instanceof ApiError ? err.message : 'Kunne ikke oppdatere stjerne.')
      return
    }
    setWarning(response.warning ? { orgnr: entry.orgnr, message: response.warning } : null)
    await load()
    announce(entry.starred ? 'Stjerne fjernet.' : 'Stjerne satt.')
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          Prøv igjen
        </button>
      </p>
    )
  }

  return (
    <div className="applications-view stack stack-lg">
      <div className="field">
        <label className="label" htmlFor="soknader-sortering">
          Sorter etter
        </label>
        <select
          id="soknader-sortering"
          className="select"
          value={sortMode}
          onChange={(event) => handleSortChange(event.target.value as SortMode)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {SECTIONS.map((status) => {
        const sectionEntries = sortEntries(
          entries.filter((e) => e.status === status),
          sortMode
        )
        const headingId = `pipeline-heading-${status}`
        return (
          <section key={status} aria-labelledby={headingId} className="card stack">
            <h2 id={headingId}>{PIPELINE_LABELS[status]}</h2>
            {status === 'active' && (
              <p className="muted help">Aktiv-oppføringer tas aldri med i eksporten.</p>
            )}
            <ul className="stack stack-sm">
              {sectionEntries.map((entry) => {
                const missingWhy = status !== 'active' && !entry.why
                const isEditing = editingOrgnr === entry.orgnr
                return (
                  <li key={entry.orgnr} className="panel stack stack-sm">
                    <div className="cluster cluster-sm cluster-between">
                      <span className="text-strong">{entry.companyName}</span>
                      <button
                        type="button"
                        className="btn btn-ghost icon-btn"
                        aria-pressed={entry.starred}
                        aria-label={entry.starred ? 'Fjern stjerne' : 'Gi stjerne'}
                        onClick={() => toggleStar(entry)}
                      >
                        <span aria-hidden="true">{entry.starred ? '★' : '☆'}</span>
                      </button>
                    </div>
                    {!isEditing && (
                      <>
                        <div className="cluster cluster-sm">
                          {missingWhy ? (
                            <span className="badge badge-warning">⚠ mangler begrunnelse</span>
                          ) : (
                            entry.why && <span className="text-muted">{entry.why}</span>
                          )}
                          {entry.note && <span className="text-muted">{entry.note}</span>}
                          {entry.svar && <span className="text-muted">{entry.svar}</span>}
                          <span className="help">{formatUpdated(entry.updated)}</span>
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
                          Rediger
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
                            Status
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
                                {PIPELINE_LABELS[slug]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field">
                          <label className="label" htmlFor={`why-${entry.orgnr}`}>
                            Begrunnelse
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
                            Notat
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
                            Svar
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
                            Lagre
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                            Avbryt
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
