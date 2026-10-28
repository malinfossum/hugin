import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
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
import { SettingsSection } from './SettingsSection'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
import { Button } from './ui/button'
import { toast } from './ui/toast'

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
    if (sync === 'busy') toast.add({ type: 'info', title: t('coverage.savedSyncBusy') })
    else if (sync === 'failed') toast.add({ type: 'warning', title: t('coverage.savedSyncFailed') })
    else toast.add({ type: 'success', title: t('coverage.saved') })
  }

  return (
    <SettingsSection
      headingId="settings-coverage-heading"
      title={t('coverage.heading')}
      hint={t('coverage.hint')}
    >
      {(loadFailed || saveError) && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm text-foreground"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {loadFailed ? t('coverage.loadError') : saveError}
          {!coverage && (
            <Button variant="link" className="min-h-11" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          )}
        </p>
      )}

      {coverage && (
        <>
          <fieldset
            className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
            disabled={readOnly}
            aria-label={t('coverage.heading')}
          >
            <CoverageFields
              idPrefix="settings-coverage"
              draft={coverage}
              onChange={setEdited}
              kommuner={kommuner}
            />
          </fieldset>
          {!readOnly && (
            <Button
              size="touch"
              className="self-start"
              onClick={handleSave}
              disabled={saving || kommuner === undefined}
            >
              {t('coverage.save')}
            </Button>
          )}
        </>
      )}

      <UnsavedChangesGuard dirty={dirty} />
    </SettingsSection>
  )
}
