import { useEffect, useState } from 'react'
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
 * failure, never as if the reset happened. */
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
      // Everything on screen assumed a database that no longer exists — a full reload is the
      // simplest honest way to reflect that, and it stays disabled (saving never resets) until
      // it happens.
      window.location.reload()
    } catch (err) {
      setSaving(false)
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
          <label className="label" htmlFor="reset-confirm-word">
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
