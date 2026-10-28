import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CoverageSection } from '../components/CoverageSection'
import { DisplayFilterSection } from '../components/DisplayFilterSection'
import { FocusSection } from '../components/FocusSection'
import { useAnnounce } from '../components/LiveRegion'
import { ResetSection } from '../components/ResetSection'
import { SettingsSection } from '../components/SettingsSection'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { toast } from '../components/ui/toast'
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
 * toggles only (v3.6.1). They used to be duplicated as cards here. The Dekning section (v3.4)
 * lives in CoverageSection, and the Visningsfilter card (v3.6) lives in DisplayFilterSection.
 * Brreg/NAV aren't editable here. They're fixed, i18n-sourced entries shown on the dashboard's
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
    toast.add({ type: 'success', title: t('settings.sourceAdded') })
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
    toast.add({ type: 'success', title: t('settings.sourceSaved') })
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
    toast.add({ type: 'success', title: t('settings.sourceRemoved') })
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
    <div className="flex flex-col pt-2 font-sans md:pt-6">
      {/* In the order the data flows: what is fetched, what is kept, what is shown; then the
      link-out sources, and resetting last. */}
      <CoverageSection
        onSaved={() => {
          setCoverageVersion((v) => v + 1)
          // A scope was just written: the same live-value fix as first-run's onDone (Task 11
          // finding 1), for the path that never goes through FirstRunDialog at all.
          markScopeConfigured()
        }}
      />

      <FocusSection previewVersion={coverageVersion} />

      <DisplayFilterSection />

      <SettingsSection
        headingId="settings-sources-heading"
        title={t('settings.sourcesHeading')}
        hint={t('settings.sourcesHint')}
      >
        {listError && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm text-foreground"
          >
            <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
            {listError}
            <Button
              variant="link"
              className="min-h-11"
              onClick={() => {
                setActionError(null)
                refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </p>
        )}

        <ul className="flex list-none flex-col border-b border-border ps-0">
          {sources.map((source, index) => (
            <li
              key={source.id}
              className="border-t border-border py-1.5 text-foreground first:border-t-0 first:pt-0"
            >
              {editingId === source.id ? (
                <form
                  className="flex flex-col gap-3 py-2"
                  onSubmit={(event) => handleEditSubmit(source.id, event)}
                >
                  {/* Side by side only from lg: at md the controls column is about 300 px and
                  the URL field would shrink to a sliver. */}
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <div className="flex flex-col gap-1.5 lg:w-56">
                      <label
                        htmlFor={`edit-label-${source.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        {t('settings.label')}
                      </label>
                      <Input
                        id={`edit-label-${source.id}`}
                        type="text"
                        value={editForm.label}
                        onChange={(event) =>
                          setEditForm({ ...editForm, label: event.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <label
                        htmlFor={`edit-url-${source.id}`}
                        className="text-sm text-muted-foreground"
                      >
                        {t('settings.url')}
                      </label>
                      <Input
                        id={`edit-url-${source.id}`}
                        type="url"
                        value={editForm.url}
                        onChange={(event) => setEditForm({ ...editForm, url: event.target.value })}
                        required
                      />
                    </div>
                  </div>
                  {editError && (
                    <p role="status" className="flex items-center gap-x-2 text-body-sm">
                      <AlertTriangle
                        aria-hidden="true"
                        className="size-4 shrink-0 text-destructive"
                      />
                      {editError}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="touch">
                      {t('settings.save')}
                    </Button>
                    <Button variant="ghost" size="touch" onClick={cancelEdit}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-4">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 font-medium text-foreground no-underline hover:underline"
                  >
                    {source.label}
                    <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  </a>
                  {!readOnly && (
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11"
                        aria-label={t('settings.moveUp')}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="size-11"
                        aria-label={t('settings.moveDown')}
                        disabled={index === sources.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button variant="link" className="min-h-11" onClick={() => startEdit(source)}>
                        {t('settings.edit')}
                      </Button>
                      <Button
                        variant="link"
                        className="min-h-11"
                        onClick={() => setRemoving(source)}
                      >
                        {t('settings.remove')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {!readOnly && (
          <form className="flex flex-col gap-3" onSubmit={handleAdd}>
            {/* As in the edit form: one row from lg, where the URL field has room. */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex flex-col gap-1.5 lg:w-56">
                <label htmlFor="add-source-label" className="text-sm text-muted-foreground">
                  {t('settings.label')}
                </label>
                <Input
                  id="add-source-label"
                  type="text"
                  value={addForm.label}
                  onChange={(event) => setAddForm({ ...addForm, label: event.target.value })}
                  required
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="add-source-url" className="text-sm text-muted-foreground">
                  {t('settings.url')}
                </label>
                <Input
                  id="add-source-url"
                  type="url"
                  value={addForm.url}
                  onChange={(event) => setAddForm({ ...addForm, url: event.target.value })}
                  required
                />
              </div>
              <Button type="submit" variant="outline" size="touch">
                <Plus aria-hidden="true" />
                {t('settings.addSource')}
              </Button>
            </div>
            {addError && (
              <p role="status" className="flex items-center gap-x-2 text-body-sm">
                <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                {addError}
              </p>
            )}
          </form>
        )}
      </SettingsSection>

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
