import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFocus } from '../context/focus'
import { useReadOnly } from '../context/readOnly'
import { useFormatNumber, useT } from '../i18n'
import { ApiError, api } from '../lib/api'
import { queryKeys, statusQuery } from '../lib/queries'
import type { ResetResultDto } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { SettingsSection } from './SettingsSection'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { toast } from './ui/toast'

/** The exact word the hard reset's confirm field must match. Spec-locked, and deliberately not
 * translated: a typed-confirmation phrase names the destructive action, not the UI language. */
const CONFIRM_WORD = 'NULLSTILL'

/** Settings → Nullstilling (spec v3.5 Part D): the last section, its buttons in danger, hidden entirely
 * in read-only mode. Two levels behind POST /api/reset. "scope" just clears the discovery
 * config (so the first-run dialog can ask again), "all" also wipes the database after a
 * VACUUM INTO snapshot. Both are refused with 409 while a sync runs; that must surface as a
 * failure, never as if the reset happened. The hard reset's success message names the snapshot
 * path (D2) and waits for the person to press its own reload button, rather than reloading out
 * from under the message the moment it appears. */
export function ResetSection() {
  // Best-effort. Only used to show the counts in the hard-reset dialog. Missing counts just
  // means that paragraph doesn't render; it never blocks either button.
  const { data: status } = useQuery(statusQuery())
  const queryClient = useQueryClient()
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
  const formatNumber = useFormatNumber()
  const { readOnly } = useReadOnly()
  const { resetFocus } = useFocus()
  const reloadButtonRef = useRef<HTMLButtonElement>(null)

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
    queryClient.invalidateQueries({ queryKey: queryKeys.discovery })
    queryClient.invalidateQueries({ queryKey: queryKeys.status })
    setSaving(false)
    toast.add({ type: 'success', title: t('reset.scopeDone') })
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
      // honest way to reflect that. But firing it here, before this render commits, is exactly
      // why the snapshot path was never seen: `window.location.reload()` cuts the page away
      // before React paints the message above. Leave `saving` true (both trigger buttons stay
      // disabled) and wait for the person to read the path and press the reload button below
      // instead of reloading out from under them. Focus will move to the reload button via a
      // useEffect watching `hardMessage`.
    } catch (err) {
      setSaving(false)
      // Re-typing the confirm word per attempt is the whole point of the gate. A failed
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
    <SettingsSection headingId="reset-heading" title={t('reset.heading')} hint={t('reset.hint')}>
      {scopeError && (
        <p
          role="alert"
          className="flex items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {scopeError}
        </p>
      )}
      {hardMessage && (
        <p
          role={hardMessage.kind === 'error' ? 'alert' : 'status'}
          className="flex items-center gap-x-3 border-y border-border py-3 text-body-sm"
        >
          {hardMessage.kind === 'error' ? (
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          ) : (
            <Check aria-hidden="true" className="size-4 shrink-0" />
          )}
          {hardMessage.text}
        </p>
      )}
      {hardMessage?.kind === 'success' && (
        <Button
          ref={reloadButtonRef}
          size="touch"
          className="self-start"
          onClick={() => window.location.reload()}
        >
          <RotateCw aria-hidden="true" />
          {t('reset.hardReload')}
        </Button>
      )}

      {/* The two levels apart, each with what it keeps beside it, so the smaller one is not
      mistaken for the larger. */}
      <div className="flex flex-col">
        <div className="flex flex-col gap-x-4 gap-y-2 pb-4 md:flex-row md:items-center">
          <Button
            variant="destructive"
            size="touch"
            className="self-start md:self-auto"
            onClick={() => setScopeOpen(true)}
            disabled={saving}
          >
            {t('reset.scopeButton')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('reset.scopeSummary')}</p>
        </div>
        <div className="flex flex-col gap-x-4 gap-y-2 border-t border-border pt-4 md:flex-row md:items-center">
          <Button
            variant="destructive"
            size="touch"
            className="self-start md:self-auto"
            onClick={() => setHardOpen(true)}
            disabled={saving}
          >
            {t('reset.hardButton')}
          </Button>
          <p className="text-sm text-muted-foreground">{t('reset.hardSummary')}</p>
        </div>
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
              companies: formatNumber(status.storedCompanies),
              ads: formatNumber(status.storedAds),
              pipelineEntries: formatNumber(status.pipelineEntries),
            })}
          </p>
        )}
        <p>
          {t('reset.exportFirst')}{' '}
          <a
            href="/export"
            className="text-foreground underline decoration-input underline-offset-3 hover:decoration-current"
          >
            {t('reset.exportFirstLink')}
          </a>
        </p>
        <div className="flex flex-col gap-1.5">
          <label
            id="reset-confirm-word-label"
            htmlFor="reset-confirm-word"
            className="text-sm text-muted-foreground"
          >
            {t('reset.confirmLabel')}
          </label>
          <Input
            id="reset-confirm-word"
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </SettingsSection>
  )
}
