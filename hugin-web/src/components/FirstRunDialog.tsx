import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import {
  type CoverageDraft,
  effectiveDraft,
  fromDiscoveryConfig,
  NO_OTHERS,
  toDiscoveryRequest,
  toFocusSeed,
} from '../coverage'
import type { Focus } from '../focus'
import { KNOWN_CATEGORIES } from '../focus'
import { useT } from '../i18n'
import type { DiscoveryConfigDto, KommuneDto } from '../types'
import { CoverageFields } from './CoverageFields'

interface Props {
  open: boolean
  /** The render lens, seeded from the chosen scope — saved even when the PUT fails. */
  onSaveFocus: (focus: Focus) => void
  /** The scope was written and the sync started: the parent may close the dialog. */
  onDone: () => void
  onDismiss: () => void
}

const DEFAULT_DRAFT: CoverageDraft = { fylke: '', kommuner: [], others: NO_OTHERS }

/** First-run prompt v2 (spec v3.4 Part B): the region step is scope + lens. It prefills from the
 * server's current discovery scope, lists the fylke's kommuner from /api/kommuner (degrading to
 * fylke-only when that fails), and Start writes the scope, seeds the focus and triggers a sync.
 * Native <dialog> management mirrors ConfirmDialog (showModal/close + openRef guard); Esc is
 * the only way to defer without choosing. */
export function FirstRunDialog({ open, onSaveFocus, onDone, onDismiss }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useT()
  const openRef = useRef(open)
  const [draft, setDraft] = useState<CoverageDraft>(DEFAULT_DRAFT)
  const [kommuner, setKommuner] = useState<KommuneDto[] | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    openRef.current = open
    if (open && !dialog.open) {
      dialog.showModal()
      headingRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Load the current server scope + the kommune list each time the dialog opens. Both are
  // best-effort: no scope → defaults, no kommune list → fylke granularity only.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .get<DiscoveryConfigDto>('/api/config/discovery')
      .then((config) => {
        if (!cancelled) setDraft(fromDiscoveryConfig(config))
      })
      .catch(() => {})
    api
      .get<KommuneDto[]>('/api/kommuner')
      .then((list) => {
        if (!cancelled) setKommuner(list)
      })
      .catch(() => {
        if (!cancelled) setKommuner(null)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const handleClose = () => {
    if (openRef.current) onDismiss()
  }

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleStart = async () => {
    setSaving(true)
    setError(null)
    const chosen = effectiveDraft(draft, kommuner)
    const focus = toFocusSeed(chosen, categories)
    try {
      await api.put('/api/config/discovery', toDiscoveryRequest(chosen))
    } catch (err) {
      // The lens still works without the server scope — save it, show the error, keep Start as retry.
      onSaveFocus(focus)
      setError(
        t('coverage.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    onSaveFocus(focus)
    await api.post('/api/sync').catch(() => {}) // SyncHeader shows progress; a 409 just means it already runs
    setSaving(false)
    onDone()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal stack"
      onClose={handleClose}
      aria-label={t('focus.title')}
    >
      <h2 ref={headingRef} tabIndex={-1}>
        {t('focus.title')}
      </h2>
      <p>{t('focus.intro')}</p>

      <CoverageFields idPrefix="first-run" draft={draft} onChange={setDraft} kommuner={kommuner} />

      <fieldset className="stack stack-sm">
        <legend>{t('focus.categoriesLegend')}</legend>
        <p>{t('focus.categoriesHint')}</p>
        {KNOWN_CATEGORIES.map((category) => (
          <label key={category} className="cluster cluster-sm">
            <input
              type="checkbox"
              checked={categories.includes(category)}
              onChange={() => toggleCategory(category)}
            />
            {category}
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}

      <div className="dialog-actions cluster cluster-sm">
        <button type="button" className="btn btn-primary" onClick={handleStart} disabled={saving}>
          {t('focus.start')}
        </button>
      </div>
    </dialog>
  )
}
