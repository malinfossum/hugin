import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useReadOnly } from '../context/readOnly'
import { useT } from '../i18n'
import { ApiError, api } from '../lib/api'
import {
  type CoverageDraft,
  effectiveDraft,
  fromDiscoveryConfig,
  toDiscoveryRequest,
} from '../lib/coverage'
import { discoveryQuery, kommunerQuery, queryKeys } from '../lib/queries'
import type { DiscoveryConfigDto } from '../lib/types'
import { CoverageFields } from './CoverageFields'
import { useAnnounce } from './LiveRegion'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'

interface CoverageSectionProps {
  /** Fires once the PUT succeeds, before the follow-up sync is even attempted. The scope
   * it reads is already the new one. SettingsView uses this to bump a `previewVersion` counter
   * that is passed to FocusSection and folded into its per-code preview cache key (v3.5 Task 11
   * ruling 2): the cached count for a bransje code depends on the coverage it was previewed
   * under, and a stale count read after changing coverage would be wrong, not just stale.
   * FocusSection is never remounted for this, since that would also discard an unsaved
   * bransje/keyword draft. */
  onSaved?: () => void
}

/** Settings → Dekning (spec v3.4 Part B): edits the server's discovery scope (what sync
 * fetches) through the same fylke → kommune cascade as the first-run dialog. Loads the scope
 * and the kommune list once on mount; Save PUTs the scope and starts a sync, announcing
 * honestly when that sync is busy or could not start. */
export function CoverageSection({ onSaved }: CoverageSectionProps) {
  const queryClient = useQueryClient()
  const { data: config, isError, refetch } = useQuery(discoveryQuery())
  // Only a load that never produced a scope counts: a failed background refetch keeps showing
  // the scope it has.
  const loadFailed = isError && config === undefined
  // What the person has changed since the scope loaded. The shown draft is the server's scope
  // until then, and their edits after. A refetch never overwrites an unsaved draft.
  const [edited, setEdited] = useState<CoverageDraft | null>(null)
  const coverage = edited ?? (config ? fromDiscoveryConfig(config) : null)
  // An edit undone by hand (a kommune ticked and unticked again) leaves nothing to lose.
  const dirty =
    edited !== null &&
    (!config || JSON.stringify(edited) !== JSON.stringify(fromDiscoveryConfig(config)))
  const { data: kommunerList, isError: kommunerFailed } = useQuery(kommunerQuery())
  // undefined = still loading (Save disabled), null = unreachable (fylke-only cascade).
  const kommuner = kommunerFailed ? null : kommunerList
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const t = useT()
  const announce = useAnnounce()
  const { readOnly } = useReadOnly()

  // The kommune list is best-effort (null → fylke-only cascade) and Save waits for it to
  // settle, since a save without the list degrades to the fylke alone.

  const handleSave = async () => {
    if (!coverage || kommuner === undefined) return
    setSaving(true)
    setSaveError(null)
    try {
      // The PUT answers with the scope as written, so the cache takes it straight away and the
      // draft is done: the section shows the server's scope again, as FocusSection does.
      const written = await api.put<DiscoveryConfigDto>(
        '/api/config/discovery',
        toDiscoveryRequest(effectiveDraft(coverage, kommuner))
      )
      queryClient.setQueryData(queryKeys.discovery, written)
      setEdited(null)
    } catch (err) {
      setSaveError(
        t('coverage.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    onSaved?.()
    // A sync that was already running read the old scope before this save, so the new one
    // only takes effect on the next run. Say that instead of claiming a sync is fetching it.
    // Any other failure to start is said plainly too: the scope is saved, nothing is fetching.
    const sync = await api.post('/api/sync').then(
      (): 'started' | 'busy' | 'failed' => 'started',
      (err): 'busy' | 'failed' =>
        err instanceof ApiError && err.status === 409 ? 'busy' : 'failed'
    )
    setSaving(false)
    announce(
      t(
        sync === 'busy'
          ? 'coverage.savedSyncBusy'
          : sync === 'failed'
            ? 'coverage.savedSyncFailed'
            : 'coverage.saved'
      )
    )
  }

  return (
    <section aria-labelledby="settings-coverage-heading" className="card settings-group stack">
      <h2 id="settings-coverage-heading">{t('coverage.heading')}</h2>
      <p className="help">{t('coverage.hint')}</p>

      {(loadFailed || saveError) && (
        <p role="alert" className="alert alert-danger cluster cluster-sm">
          {loadFailed ? t('coverage.loadError') : saveError}
          {!coverage && (
            <button type="button" className="btn btn-ghost" onClick={() => refetch()}>
              {t('common.retry')}
            </button>
          )}
        </p>
      )}

      {coverage && (
        <>
          <fieldset className="stack" disabled={readOnly} aria-label={t('coverage.heading')}>
            <CoverageFields
              idPrefix="settings-coverage"
              draft={coverage}
              onChange={setEdited}
              kommuner={kommuner}
            />
          </fieldset>
          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || kommuner === undefined}
            >
              {t('coverage.save')}
            </button>
          )}
        </>
      )}

      <UnsavedChangesGuard dirty={dirty} />
    </section>
  )
}
