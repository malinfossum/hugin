import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useLang, useT } from '../i18n'
import type { SourceDto } from '../types'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onSourcesChanged: () => void
}

interface SourceFormState {
  label: string
  url: string
}

const EMPTY_FORM: SourceFormState = { label: '', url: '' }

/** Settings view (spec v3.2 item 8): sources CRUD + reorder, plus language and theme — the
 * "home" for these prefs, while the topbar keeps its own quick toggles. Discovery-config
 * editing is out of scope for this phase. Brreg/NAV aren't editable here — they're fixed,
 * i18n-sourced entries shown on the dashboard's SourcesCard, not rows in this list. */
export function SettingsView({ theme, onToggleTheme, onSourcesChanged }: Props) {
  const [sources, setSources] = useState<SourceDto[]>([])
  const [addForm, setAddForm] = useState<SourceFormState>(EMPTY_FORM)
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<SourceFormState>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<SourceDto | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const t = useT()
  const [lang, setLang] = useLang()

  const load = useCallback(() => {
    return api
      .get<SourceDto[]>('/api/sources')
      .then(setSources)
      .catch(() => setSources([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAddError(null)
    try {
      await api.post('/api/sources', { label: addForm.label, url: addForm.url })
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : String(err))
      return
    }
    setAddForm(EMPTY_FORM)
    await load()
    onSourcesChanged()
  }

  const startEdit = (source: SourceDto) => {
    setEditingId(source.id)
    setEditForm({ label: source.label, url: source.url })
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
    setEditError(null)
  }

  const handleEditSubmit = async (id: number, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEditError(null)
    try {
      await api.put(`/api/sources/${id}`, { label: editForm.label, url: editForm.url })
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : String(err))
      return
    }
    cancelEdit()
    await load()
    onSourcesChanged()
  }

  const handleRemoveConfirm = async () => {
    const target = removing
    if (!target) return
    setRemoving(null)
    try {
      await api.del(`/api/sources/${target.id}`)
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : String(err))
      return
    }
    await load()
    onSourcesChanged()
  }

  const move = async (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sources.length) return
    const next = [...sources]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    setListError(null)
    try {
      await api.post('/api/sources/reorder', { ids: next.map((s) => s.id) })
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : String(err))
      return
    }
    await load()
    onSourcesChanged()
  }

  return (
    <div className="settings-view stack stack-lg">
      <section aria-labelledby="settings-sources-heading" className="card stack">
        <h2 id="settings-sources-heading">{t('settings.sourcesHeading')}</h2>
        <p className="help">{t('settings.sourcesHint')}</p>

        {listError && (
          <p role="status" className="alert alert-danger">
            {listError}
          </p>
        )}

        <ul className="stack stack-sm">
          {sources.map((source, index) => (
            <li key={source.id} className="panel stack stack-sm">
              {editingId === source.id ? (
                <form
                  className="stack stack-sm"
                  onSubmit={(event) => handleEditSubmit(source.id, event)}
                >
                  <div className="field">
                    <label className="label" htmlFor={`edit-label-${source.id}`}>
                      {t('settings.label')}
                    </label>
                    <input
                      id={`edit-label-${source.id}`}
                      className="input"
                      type="text"
                      value={editForm.label}
                      onChange={(event) => setEditForm({ ...editForm, label: event.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={`edit-url-${source.id}`}>
                      {t('settings.url')}
                    </label>
                    <input
                      id={`edit-url-${source.id}`}
                      className="input"
                      type="url"
                      value={editForm.url}
                      onChange={(event) => setEditForm({ ...editForm, url: event.target.value })}
                      required
                    />
                  </div>
                  {editError && (
                    <p role="status" className="alert alert-danger">
                      {editError}
                    </p>
                  )}
                  <div className="cluster cluster-sm">
                    <button type="submit" className="btn btn-primary">
                      {t('settings.save')}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="cluster cluster-sm cluster-between">
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.label}
                  </a>
                  <div className="cluster cluster-sm">
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      aria-label={t('settings.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      aria-label={t('settings.moveDown')}
                      disabled={index === sources.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => startEdit(source)}
                    >
                      {t('settings.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setRemoving(source)}
                    >
                      {t('settings.remove')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form className="stack stack-sm" onSubmit={handleAdd}>
          <div className="field">
            <label className="label" htmlFor="add-source-label">
              {t('settings.label')}
            </label>
            <input
              id="add-source-label"
              className="input"
              type="text"
              value={addForm.label}
              onChange={(event) => setAddForm({ ...addForm, label: event.target.value })}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="add-source-url">
              {t('settings.url')}
            </label>
            <input
              id="add-source-url"
              className="input"
              type="url"
              value={addForm.url}
              onChange={(event) => setAddForm({ ...addForm, url: event.target.value })}
              required
            />
          </div>
          {addError && (
            <p role="status" className="alert alert-danger">
              {addError}
            </p>
          )}
          <button type="submit" className="btn btn-primary">
            {t('settings.addSource')}
          </button>
        </form>
      </section>

      <section aria-labelledby="settings-language-heading" className="card stack">
        <h2 id="settings-language-heading">{t('settings.languageHeading')}</h2>
        <fieldset className="lang-toggle cluster cluster-sm">
          <legend className="visually-hidden">{t('lang.toggleLabel')}</legend>
          <span className="segmented">
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={lang === 'nb'}
              onClick={() => setLang('nb')}
            >
              NO
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </span>
        </fieldset>
      </section>

      <section aria-labelledby="settings-theme-heading" className="card stack">
        <h2 id="settings-theme-heading">{t('settings.themeHeading')}</h2>
        <button
          type="button"
          className="btn btn-ghost icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? t('theme.toggleToLight') : t('theme.toggleToDark')}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
      </section>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? t('settings.confirmRemove', { label: removing.label }) : ''}
        confirmLabel={t('settings.remove')}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
