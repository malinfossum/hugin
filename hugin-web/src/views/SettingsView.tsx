import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, api } from '../api'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAnnounce } from '../components/LiveRegion'
import { KNOWN_CATEGORIES, useFocus } from '../focus'
import { FYLKER, fylkeOf } from '../fylker'
import { useLang, useT } from '../i18n'
import type { CompanyDto, SourceDto } from '../types'

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
const FYLKE_OPTIONS = [...FYLKER.entries()]

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
  const [focusCompanies, setFocusCompanies] = useState<CompanyDto[]>([])
  const t = useT()
  const [lang, setLang] = useLang()
  const announce = useAnnounce()
  const { focus, setFocus, resetFocus } = useFocus()

  const load = useCallback(() => {
    setListError(null)
    return api
      .get<SourceDto[]>('/api/sources')
      .then(setSources)
      .catch(() => setListError(t('sources.loadError')))
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  // Lazy, one-shot fetch backing the Fokus kommune select's options — a failure just leaves the
  // select at its "Alle" option, so it's a silent catch (no error UI, nothing to retry).
  useEffect(() => {
    api
      .get<CompanyDto[]>('/api/companies')
      .then(setFocusCompanies)
      .catch(() => {})
  }, [])

  const focusKommuner = useMemo(() => {
    const byNumber = new Map<string, string>()
    for (const c of focusCompanies) {
      if (!c.kommune) continue
      if (focus?.fylke && fylkeOf(c.kommune) !== focus.fylke) continue
      if (!byNumber.has(c.kommune)) byNumber.set(c.kommune, c.kommuneNavn ?? c.kommune)
    }
    return Array.from(byNumber.entries()).sort(([, a], [, b]) => a.localeCompare(b))
  }, [focusCompanies, focus?.fylke])

  const handleFocusFylkeChange = (nextFylke: string) => {
    const currentKommune = focus?.kommune ?? ''
    const nextKommune =
      nextFylke && currentKommune && fylkeOf(currentKommune) !== nextFylke ? '' : currentKommune
    setFocus({
      fylke: nextFylke || null,
      kommune: nextKommune || null,
      categories: focus?.categories ?? [],
    })
    announce(t('settings.focusUpdated'))
  }

  // A kommune picked while focus.fylke is still unset needs its fylke derived before storing —
  // loadFocus rejects a kommune without a matching fylke, so the raw shape would round-trip as
  // null on the next boot and silently drop the choice.
  const handleFocusKommuneChange = (nextKommune: string) => {
    setFocus({
      fylke: focus?.fylke ?? fylkeOf(nextKommune),
      kommune: nextKommune || null,
      categories: focus?.categories ?? [],
    })
    announce(t('settings.focusUpdated'))
  }

  const toggleFocusCategory = (category: string) => {
    const categories = focus?.categories ?? []
    const nextCategories = categories.includes(category)
      ? categories.filter((c) => c !== category)
      : [...categories, category]
    setFocus({
      fylke: focus?.fylke ?? null,
      kommune: focus?.kommune ?? null,
      categories: nextCategories,
    })
    announce(t('settings.focusUpdated'))
  }

  const handleFocusReset = () => {
    resetFocus()
    announce(t('settings.focusResetDone'))
  }

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
    announce(t('settings.sourceAdded'))
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
    announce(t('settings.sourceSaved'))
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
    announce(t('settings.sourceRemoved'))
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
    announce(t('settings.sourceMoved'))
  }

  return (
    <div className="settings-view settings-section">
      <section aria-labelledby="settings-sources-heading" className="card settings-group">
        <h2 id="settings-sources-heading">{t('settings.sourcesHeading')}</h2>
        <p className="help">{t('settings.sourcesHint')}</p>

        {listError && (
          <p role="status" className="alert alert-danger cluster cluster-sm">
            {listError}
            <button type="button" className="btn btn-ghost" onClick={load}>
              {t('common.retry')}
            </button>
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

      <section aria-labelledby="settings-language-heading" className="card settings-group">
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

      <section aria-labelledby="settings-focus-heading" className="card settings-group stack">
        <h2 id="settings-focus-heading">{t('settings.focusHeading')}</h2>
        <p className="help">{t('settings.focusHint')}</p>

        <div className="field">
          <label className="label" htmlFor="settings-focus-fylke">
            {t('companies.fylke')}
          </label>
          <select
            id="settings-focus-fylke"
            className="select"
            value={focus?.fylke ?? ''}
            onChange={(event) => handleFocusFylkeChange(event.target.value)}
          >
            <option value="">{t('focus.allOfNorway')}</option>
            {FYLKE_OPTIONS.map(([number, name]) => (
              <option key={number} value={number}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="settings-focus-kommune">
            {t('companies.kommune')}
          </label>
          <select
            id="settings-focus-kommune"
            className="select"
            value={focus?.kommune ?? ''}
            onChange={(event) => handleFocusKommuneChange(event.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {focusKommuner.map(([number, name]) => (
              <option key={number} value={number}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="stack stack-sm">
          <legend>{t('focus.categoriesLegend')}</legend>
          <p className="help">{t('focus.categoriesHint')}</p>
          {KNOWN_CATEGORIES.map((category) => (
            <label key={category} className="cluster cluster-sm">
              <input
                type="checkbox"
                checked={focus?.categories?.includes(category) ?? false}
                onChange={() => toggleFocusCategory(category)}
              />
              {category}
            </label>
          ))}
        </fieldset>

        <button type="button" className="btn btn-ghost" onClick={handleFocusReset}>
          {t('settings.focusReset')}
        </button>
      </section>

      <section aria-labelledby="settings-theme-heading" className="card settings-group">
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
