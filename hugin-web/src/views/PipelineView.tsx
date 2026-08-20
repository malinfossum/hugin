import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { useAnnounce } from '../components/LiveRegion'
import { PIPELINE_LABELS } from '../pipelineLabels'
import type { PipelineDto, PipelineStatusSlug, TrackResponse } from '../types'

const SECTIONS: PipelineStatusSlug[] = ['funnet', 'soekt-selv', 'bedt-get', 'svar']

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

export function PipelineView() {
  const [entries, setEntries] = useState<PipelineDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editingOrgnr, setEditingOrgnr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [warning, setWarning] = useState<{ orgnr: string; message: string } | null>(null)
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
    <div className="pipeline-view stack stack-lg">
      {SECTIONS.map((status) => {
        const sectionEntries = entries.filter((e) => e.status === status)
        const headingId = `pipeline-heading-${status}`
        return (
          <section key={status} aria-labelledby={headingId} className="card stack">
            <h2 id={headingId}>{PIPELINE_LABELS[status]}</h2>
            {status === 'funnet' && (
              <p className="muted help">Funnet-oppføringer tas aldri med i eksporten.</p>
            )}
            <ul className="stack stack-sm">
              {sectionEntries.map((entry) => {
                const missingWhy = status !== 'funnet' && !entry.why
                const isEditing = editingOrgnr === entry.orgnr
                return (
                  <li key={entry.orgnr} className="panel stack stack-sm">
                    <span className="text-strong">{entry.companyName}</span>
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
