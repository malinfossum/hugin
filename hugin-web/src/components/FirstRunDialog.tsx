import { useEffect, useRef, useState } from 'react'
import type { Focus } from '../focus'
import { KNOWN_CATEGORIES } from '../focus'
import { FYLKER } from '../fylker'
import { useT } from '../i18n'

interface Props {
  open: boolean
  onSave: (focus: Focus) => void
  onDismiss: () => void
}

const FYLKE_OPTIONS = [...FYLKER.entries()]

/** First-run prompt for the starting focus filter (spec: fylke + categories, region-only —
 * kommune narrows later from Settings). Mirrors ConfirmDialog's native <dialog> management
 * (showModal/close effect + openRef guard distinguishing user-Esc from a parent-driven close),
 * except the heading (not a cancel button) gets the post-open focus, and there is no cancel
 * button — Esc is the only way to defer without choosing. */
export function FirstRunDialog({ open, onSave, onDismiss }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useT()
  const openRef = useRef(open)
  const [fylke, setFylke] = useState('')
  const [categories, setCategories] = useState<string[]>([])

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

  const handleClose = () => {
    if (openRef.current) onDismiss()
  }

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleStart = () => {
    onSave({ fylke: fylke || null, kommune: null, categories })
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

      <div className="field">
        <label className="label" htmlFor="focus-fylke">
          {t('companies.fylke')}
        </label>
        <select
          id="focus-fylke"
          className="select"
          value={fylke}
          onChange={(event) => setFylke(event.target.value)}
        >
          <option value="">{t('focus.allOfNorway')}</option>
          {FYLKE_OPTIONS.map(([number, name]) => (
            <option key={number} value={number}>
              {name}
            </option>
          ))}
        </select>
      </div>

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

      <div className="dialog-actions cluster cluster-sm">
        <button type="button" className="btn btn-primary" onClick={handleStart}>
          {t('focus.start')}
        </button>
      </div>
    </dialog>
  )
}
