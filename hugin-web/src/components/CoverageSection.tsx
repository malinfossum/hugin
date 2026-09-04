import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import {
  type CoverageDraft,
  effectiveDraft,
  fromDiscoveryConfig,
  toDiscoveryRequest,
} from '../coverage'
import { useT } from '../i18n'
import { useReadOnly } from '../readOnly'
import type { DiscoveryConfigDto, KommuneDto } from '../types'
import { CoverageFields } from './CoverageFields'
import { useAnnounce } from './LiveRegion'

/** Settings → Dekning (spec v3.4 Part B): edits the server's discovery scope — what sync
 * fetches — through the same fylke → kommune cascade as the first-run dialog. Loads the scope
 * and the kommune list once on mount; Save PUTs the scope and starts a sync, announcing
 * honestly when that sync is busy or could not start. */
export function CoverageSection() {
  const [coverage, setCoverage] = useState<CoverageDraft | null>(null)
  // undefined = still loading (Save disabled), null = unreachable (fylke-only cascade).
  const [kommuner, setKommuner] = useState<KommuneDto[] | null | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const t = useT()
  const announce = useAnnounce()
  const { readOnly } = useReadOnly()

  // The kommune list is best-effort (null → fylke-only cascade) and Save waits for it to
  // settle, since a save without the list degrades to the fylke alone. loadCoverage stays out
  // of [t]: useT() hands back a new `t` identity on every language switch, and re-running this
  // on a switch would re-GET the scope and overwrite an unsaved draft (the flag is translated
  // at render instead, so it still follows the current language).
  const loadCoverage = useCallback(() => {
    setLoadFailed(false)
    return api
      .get<DiscoveryConfigDto>('/api/config/discovery')
      .then((config) => setCoverage(fromDiscoveryConfig(config)))
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(() => {
    loadCoverage()
    api
      .get<KommuneDto[]>('/api/kommuner')
      .then(setKommuner)
      .catch(() => setKommuner(null))
  }, [loadCoverage])

  const handleSave = async () => {
    if (!coverage || kommuner === undefined) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.put('/api/config/discovery', toDiscoveryRequest(effectiveDraft(coverage, kommuner)))
    } catch (err) {
      setSaveError(
        t('coverage.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    // A sync that was already running read the old scope before this save, so the new one
    // only takes effect on the next run — say that instead of claiming a sync is fetching it.
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
            <button type="button" className="btn btn-ghost" onClick={loadCoverage}>
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
              onChange={setCoverage}
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
    </section>
  )
}
