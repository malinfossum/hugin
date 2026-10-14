import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CoverageSection } from '../components/CoverageSection'
import { DisplayFilterSection } from '../components/DisplayFilterSection'
import { FocusSection } from '../components/FocusSection'
import { useAnnounce } from '../components/LiveRegion'
import { ResetSection } from '../components/ResetSection'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { useReadOnly } from '../context/readOnly'
import { useT } from '../i18n'
import { ApiError } from '../lib/api'
import { useAddSource, useRemoveSource, useReorderSources, useUpdateSource } from '../lib/mutations'
import { sourcesQuery } from '../lib/queries'
import type { SourceDto } from '../lib/types'

interface SourceFormState {
  label: string
  url: string
}

const EMPTY_FORM: SourceFormState = { label: '', url: '' }

const errorText = (err: unknown) => (err instanceof ApiError ? err.message : String(err))

/** Settings view (spec v3.2 item 8): sources CRUD + reorder. Language and theme are topbar
 * toggles only (v3.6.1) — they used to be duplicated as cards here. The Dekning section (v3.4)
 * lives in CoverageSection, and the Visningsfilter card (v3.6) lives in DisplayFilterSection.
 * Brreg/NAV aren't editable here — they're fixed, i18n-sourced entries shown on the dashboard's
 * SourcesCard, not rows in this list. */
export function SettingsView() {
  const { data: sources = [], isError: sourcesLoadFailed, refetch } = useQuery(sourcesQuery())
  // Each mutation refetches the sources list on success; the dashboard's SourcesCard shares that
  // query key, so it refreshes too without the two views being coupled.
  const addSource = useAddSource()
  const updateSource = useUpdateSource()
  const removeSource = useRemoveSource()
  const reorderSources = useReorderSources()
  const [addForm, setAddForm] = useState<SourceFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<SourceFormState>(EMPTY_FORM)
  const [removing, setRemoving] = useState<SourceDto | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Bumped when CoverageSection's Save succeeds; passed to FocusSection as `previewVersion` and
  // folded into its preview cache key, so a code previewed under the old coverage fetches fresh
  // instead of serving a stale count (v3.5 Task 11 ruling 2). Deliberately NOT a remount key
  // (that was the original approach, and review finding 2 caught it): remounting would also
  // throw away any bransje/keyword edit still sitting unsaved in FocusSection's own draft.
  const [coverageVersion, setCoverageVersion] = useState(0)
  const t = useT()
  const announce = useAnnounce()
  const { readOnly, markScopeConfigured } = useReadOnly()

  // Either sources form holds something not saved yet: text typed into the add form, or an open
  // edit that no longer matches its source. An edit opened and left as it was is no change.
  const editedSource = sources.find((s) => s.id === editingId)
  const sourcesDirty =
    addForm.label !== '' ||
    addForm.url !== '' ||
    (editedSource !== undefined &&
      (editForm.label !== editedSource.label || editForm.url !== editedSource.url))

  const listError = actionError ?? (sourcesLoadFailed ? t('sources.loadError') : null)
  const addError = addSource.error ? errorText(addSource.error) : null
  const editError = updateSource.error ? errorText(updateSource.error) : null

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (addSource.isPending) return
    try {
      await addSource.mutateAsync({ label: addForm.label, url: addForm.url })
    } catch {
      return // shown from addSource.error
    }
    setAddForm(EMPTY_FORM)
    // A successful mutation also clears any earlier action error, so a stale failure banner
    // doesn't outlive the fix.
    setActionError(null)
    announce(t('settings.sourceAdded'))
  }

  const startEdit = (source: SourceDto) => {
    setEditingId(source.id)
    setEditForm({ label: source.label, url: source.url })
    updateSource.reset()
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
    updateSource.reset()
  }

  const handleEditSubmit = async (id: number, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (updateSource.isPending) return
    try {
      await updateSource.mutateAsync({ id, label: editForm.label, url: editForm.url })
    } catch {
      return // shown from updateSource.error
    }
    cancelEdit()
    setActionError(null)
    announce(t('settings.sourceSaved'))
  }

  const handleRemoveConfirm = async () => {
    const target = removing
    if (!target) return
    setRemoving(null)
    setActionError(null)
    try {
      await removeSource.mutateAsync(target.id)
    } catch (err) {
      setActionError(errorText(err))
      return
    }
    announce(t('settings.sourceRemoved'))
  }

  const move = async (index: number, direction: -1 | 1) => {
    // The new order is built from the list on screen, so a second move before the first one's
    // refetch lands would undo it.
    if (reorderSources.isPending) return
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= sources.length) return
    const next = [...sources]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    setActionError(null)
    try {
      await reorderSources.mutateAsync(next.map((s) => s.id))
    } catch (err) {
      setActionError(errorText(err))
      return
    }
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
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setActionError(null)
                refetch()
              }}
            >
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
                  {!readOnly && (
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
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
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
        )}
      </section>

      <CoverageSection
        onSaved={() => {
          setCoverageVersion((v) => v + 1)
          // A scope was just written — the same live-value fix as first-run's onDone (Task 11
          // finding 1), for the path that never goes through FirstRunDialog at all.
          markScopeConfigured()
        }}
      />

      <FocusSection previewVersion={coverageVersion} />

      <DisplayFilterSection />

      <ResetSection />

      <ConfirmDialog
        open={removing !== null}
        title={removing ? t('settings.confirmRemove', { label: removing.label }) : ''}
        confirmLabel={t('settings.remove')}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setRemoving(null)}
      />

      <UnsavedChangesGuard dirty={sourcesDirty} />
    </div>
  )
}
