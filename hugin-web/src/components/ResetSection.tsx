import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { useFocus } from '../focus'
import { useT } from '../i18n'
import { useReadOnly } from '../readOnly'
import type { ResetResultDto, StatusDto } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { useAnnounce } from './LiveRegion'

/** The exact word the hard reset's confirm field must match — spec-locked, and deliberately not
 * translated: a typed-confirmation phrase names the destructive action, not the UI language. */
const CONFIRM_WORD = 'NULLSTILL'

/** Settings → Nullstilling (spec v3.5 Part D): the last section, danger-styled, hidden entirely
 * in read-only mode. Two levels behind POST /api/reset — "scope" just clears the discovery
 * config (so the first-run dialog can ask again), "all" also wipes the database after a
 * VACUUM INTO snapshot. Both are refused with 409 while a sync runs; that must surface as a
 * failure, never as if the reset happened. The hard reset's success message names the snapshot
 * path (D2) and waits for the person to press its own reload button, rather than reloading out
 * from under the message the moment it appears. */
export function ResetSection() {
  const [status, setStatus] = useState<StatusDto | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [hardOpen, setHardOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [saving, setSaving] = useState(false)
  const [scopeError, setScopeError] = useState<string | null>(null)
  const [hardMessage, setHardMessage] = useState<{
    kind: 'error' | 'success'
    text: string
  } | null>(null)
  const t = useT()
  const announce = useAnnounce()
  const { readOnly } = useReadOnly()
  const { resetFocus } = useFocus()
  const reloadButtonRef = useRef<HTMLButtonElement>(null)

  // Best-effort — only used to show the counts in the hard-reset dialog. Missing counts just
  // means that paragraph doesn't render; it never blocks either button.
  useEffect(() => {
    let cancelled = false
    api
      .get<StatusDto>('/api/status')
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Move focus to the reload button once the success message appears. On success, both trigger
  // buttons stay disabled (since `saving` stays true), so focus must move somewhere meaningful.
  // The reload button is the natural next action after the person reads the snapshot path.
  useEffect(() => {
    if (hardMessage?.kind === 'success') {
      reloadButtonRef.current?.focus()
    }
  }, [hardMessage])

  const handleScopeConfirm = async () => {
    setScopeOpen(false)
    setSaving(true)
    setScopeError(null)
    try {
      await api.post('/api/reset', { mode: 'scope' })
    } catch (err) {
      setSaving(false)
      setScopeError(
        t('reset.scopeFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      return
    }
    resetFocus()
    setSaving(false)
    announce(t('reset.scopeDone'))
  }

  const handleHardConfirm = async () => {
    setHardOpen(false)
    setSaving(true)
    setHardMessage(null)
    try {
      const result = await api.post<ResetResultDto>('/api/reset', { mode: 'all' })
      setConfirmText('')
      resetFocus()
      setHardMessage({
        kind: 'success',
        text: t('reset.hardDone', { path: result.snapshotPath ?? '' }),
      })
      // Everything on screen assumed a database that no longer exists, so a reload is still the
      // honest way to reflect that — but firing it here, before this render commits, is exactly
      // why the snapshot path was never seen: `window.location.reload()` cuts the page away
      // before React paints the message above. Leave `saving` true (both trigger buttons stay
      // disabled) and wait for the person to read the path and press the reload button below
      // instead of reloading out from under them. Focus will move to the reload button via a
      // useEffect watching `hardMessage`.
    } catch (err) {
      setSaving(false)
      // Re-typing the confirm word per attempt is the whole point of the gate — a failed
      // attempt must not leave it armed for a silent retry on the next open (Task 11 finding 3).
      setConfirmText('')
      setHardMessage({
        kind: 'error',
        text: t('reset.hardFailed', { error: err instanceof ApiError ? err.message : String(err) }),
      })
    }
  }

  if (readOnly) return null

  return (
    <section aria-labelledby="reset-heading" className="card settings-group stack reset-section">
      <h2 id="reset-heading">{t('reset.heading')}</h2>
      <p className="help">{t('reset.hint')}</p>

      {scopeError && (
        <p role="alert" className="alert alert-danger cluster cluster-sm">
          {scopeError}
        </p>
      )}
      {hardMessage && (
        <p
          role={hardMessage.kind === 'error' ? 'alert' : 'status'}
          className={`alert ${hardMessage.kind === 'error' ? 'alert-danger' : 'alert-success'} cluster cluster-sm`}
        >
          {hardMessage.text}
        </p>
      )}
      {hardMessage?.kind === 'success' && (
        <button
          ref={reloadButtonRef}
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          {t('reset.hardReload')}
        </button>
      )}

      <div className="cluster cluster-sm">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setScopeOpen(true)}
          disabled={saving}
        >
          {t('reset.scopeButton')}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setHardOpen(true)}
          disabled={saving}
        >
          {t('reset.hardButton')}
        </button>
      </div>

      <ConfirmDialog
        open={scopeOpen}
        title={t('reset.scopeConfirmTitle')}
        confirmLabel={t('reset.scopeButton')}
        variant="danger"
        onConfirm={handleScopeConfirm}
        onCancel={() => setScopeOpen(false)}
      >
        <p>{t('reset.scopeConfirmBody')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={hardOpen}
        title={t('reset.hardConfirmTitle')}
        confirmLabel={t('reset.hardConfirmButton')}
        variant="danger"
        confirmDisabled={confirmText !== CONFIRM_WORD}
        confirmDescribedBy="reset-confirm-word-label"
        onConfirm={handleHardConfirm}
        onCancel={() => {
          setHardOpen(false)
          setConfirmText('')
        }}
      >
        <p>{t('reset.hardConfirmIntro')}</p>
        {status && (
          <p>
            {t('reset.hardCounts', {
              companies: String(status.companies),
              activeAds: String(status.activeAds),
              pipelineEntries: String(status.pipelineEntries),
            })}
          </p>
        )}
        <p>
          <a href="/export">{t('nav.export')}</a>
        </p>
        <div className="field">
          <label id="reset-confirm-word-label" className="label" htmlFor="reset-confirm-word">
            {t('reset.confirmLabel')}
          </label>
          <input
            id="reset-confirm-word"
            className="input"
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </section>
  )
}
