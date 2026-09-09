import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { type T, useT } from '../i18n'
import { useReadOnly } from '../readOnly'
import type { FocusConfigDto, NacePreviewDto } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { useAnnounce } from './LiveRegion'

// Same shape the API validates with — kept in sync deliberately, so the field can reject a typo
// without a round-trip.
const NACE_PATTERN = /^\d{2}(\.\d{1,3})?$/

/** "62.010" is redundant if "62" is already listed, and typing "62" makes an already-listed
 * "62.010" redundant too (ruling 2: the warning works in both directions). Returns the other
 * code in the prefix relationship, or undefined when there isn't one. */
function relatedCode(code: string, existing: string[]): string | undefined {
  return existing.find((c) => c !== code && (code.startsWith(c) || c.startsWith(code)))
}

/** Builds the "already covered" message, always naming the narrower code first regardless of
 * which of the two the user actually typed — a prefix relationship between valid NACE codes
 * always has the shorter (fewer digits) one as the broader industry. */
function coveredMessage(code: string, other: string, t: T): string {
  const narrower = other.length > code.length ? other : code
  const broader = other.length > code.length ? code : other
  return t('focus.covered', { code: narrower, broader })
}

interface Props {
  /** Bumped by SettingsView whenever a coverage save succeeds. Folded into the preview cache
   * key below (not used as a remount key — a coverage save must not discard an unsaved
   * bransje/keyword draft, Task 11 finding 2): a code already previewed under the old coverage
   * still fetches fresh, since the cache key it lived under no longer matches. */
  previewVersion?: number
}

/** Settings → Fokus (spec v3.5 Part B): edits the server's discovery bransjer/keywords through
 * hugin.json, mirroring CoverageSection's shape (load once, keep a draft, one Save) and its
 * conventions for read-only mode, saving and errors. Also carries the Part C full-backfill
 * button — SyncHeader's polling must stay identity-independent (v3.2 trap), so it can't live
 * there. */
export function FocusSection({ previewVersion = 0 }: Props) {
  const [loaded, setLoaded] = useState<FocusConfigDto | null>(null)
  const [draft, setDraft] = useState<FocusConfigDto | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [recommended, setRecommended] = useState<string[] | null>(null)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const t = useT()
  const announce = useAnnounce()
  const { readOnly } = useReadOnly()
  const addCodeRef = useRef<HTMLInputElement>(null)
  const addKeywordRef = useRef<HTMLInputElement>(null)
  // Cached per code, keyed together with `previewVersion` so a coverage save (which bumps that
  // prop) invalidates every cached count without needing a remount — a count fetched under the
  // old kommuner is a wrong number, not a stale one, but the fix is a version-qualified key
  // (Task 11 finding 2), not throwing away the whole component (and the unsaved draft with it).
  const previewCache = useRef(new Map<string, NacePreviewDto>())

  const load = useCallback(() => {
    setLoadFailed(false)
    return api
      .get<FocusConfigDto>('/api/config/focus')
      .then((config) => {
        setLoaded(config)
        setDraft(config)
      })
      .catch(() => setLoadFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Shared by the single-code preview button and the "Legg til anbefalte" total below — both
  // want the same cache (keyed on `previewVersion`, so a coverage save invalidates every count
  // at once) and the same guarded fetch, and neither should re-request a code the other already
  // resolved. Returns null on any failure (bad response, network, Brreg down) — callers decide
  // how to talk about a null, since a single failed code means something different in a sum
  // than it does on its own.
  const resolvePreview = useCallback(
    async (code: string): Promise<NacePreviewDto | null> => {
      const cacheKey = `${previewVersion}:${code}`
      const cached = previewCache.current.get(cacheKey)
      if (cached) return cached
      const result = await api
        .getGuarded<NacePreviewDto>(`/api/config/focus/preview?nace=${encodeURIComponent(code)}`)
        .catch(() => null)
      if (result) previewCache.current.set(cacheKey, result)
      return result
    },
    [previewVersion]
  )

  const preview = async (code: string) => {
    // A format failure is not a Brreg failure — claiming one (as this used to, via the same
    // "kunne ikke hente antall" text as a real lookup failure) reports a lookup that never ran.
    if (!NACE_PATTERN.test(code)) {
      setPreviewText(t('focus.invalidCode'))
      return
    }
    const result = await resolvePreview(code)
    if (!result) {
      setPreviewText(t('focus.previewFailed'))
      return
    }
    // Ruling 3: only a genuine zero count says "0 bedrifter" — a resolved, nonzero count with no
    // name shows the count honestly, with the code standing in for the missing name.
    const text =
      result.units === 0
        ? t('focus.previewUnknown', { code: result.code })
        : result.name
          ? t('focus.previewResult', {
              code: result.code,
              name: result.name,
              units: String(result.units),
            })
          : t('focus.previewNoName', { code: result.code, units: String(result.units) })
    setPreviewText(text)
    // Spec B5: "A resolved preview is announced" — an async count that only ever exists
    // visually is invisible to a screen reader, since nothing else signals it arrived.
    announce(text)
  }

  const handleAddCode = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const code = codeInput.trim()
    if (!NACE_PATTERN.test(code)) {
      // Same format failure as the preview button, and the same honest message — pressing Add
      // on an invalid code used to no-op silently, which reads as a dead button.
      setPreviewText(t('focus.invalidCode'))
      return
    }
    if (draft.naeringskoder.includes(code)) return
    setDraft({ ...draft, naeringskoder: [...draft.naeringskoder, code] })
    setCodeInput('')
    setPreviewText(null)
  }

  // Same defect class as removeKeyword below: removing the last bransje chip must not let focus
  // fall to <body>. The input never unmounts across this update, so focusing it synchronously
  // here is safe.
  const removeCode = (code: string) => {
    if (!draft) return
    const wasLast = draft.naeringskoder.length === 1
    setDraft({ ...draft, naeringskoder: draft.naeringskoder.filter((c) => c !== code) })
    if (wasLast) addCodeRef.current?.focus()
  }

  // Spec B4: offers exactly the codes not already configured (the `missing` filter below), and
  // — the half that was never built — previews the total those additions bring in before the
  // user saves. Reuses `resolvePreview`'s cache and guarded fetch rather than a new endpoint.
  const handleAddRecommended = async () => {
    let codes = recommended
    if (!codes) {
      try {
        codes = await api.get<string[]>('/api/config/focus/recommended')
        setRecommended(codes)
      } catch {
        // A dead-looking button is the defect this closes: a failed fetch used to return with
        // nothing shown at all.
        setPreviewText(t('focus.recommendedFailed'))
        return
      }
    }
    if (!draft) return
    const missing = codes.filter((c) => !draft.naeringskoder.includes(c))
    if (missing.length === 0) return
    setDraft({ ...draft, naeringskoder: [...draft.naeringskoder, ...missing] })

    const results = await Promise.all(missing.map((code) => resolvePreview(code)))
    const known = results.filter((r): r is NacePreviewDto => r !== null)
    const total = known.reduce((sum, r) => sum + r.units, 0)
    // A total that is partly unknown must say so rather than under-report (ruling 3's honesty,
    // extended from a single code to a sum of them) — Brreg being unreachable for some of the
    // newly added codes must not silently read as "the rest add zero".
    const text =
      known.length === missing.length
        ? t('focus.recommendedAddedTotal', { count: String(missing.length), units: String(total) })
        : t('focus.recommendedAddedPartial', {
            count: String(missing.length),
            known: String(known.length),
            units: String(total),
          })
    setPreviewText(text)
    announce(text)
  }

  const handleAddKeyword = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const keyword = keywordInput.trim()
    if (!keyword || draft.keywords.includes(keyword)) return
    setDraft({ ...draft, keywords: [...draft.keywords, keyword] })
    setKeywordInput('')
  }

  // Removing the last keyword must not let focus fall to <body> — land it on the add field
  // instead. The input never unmounts across this update, so focusing it synchronously here
  // (rather than through a pending-focus ref + effect, the pattern other lists use when their
  // removal round-trips through the server) is safe: no re-render can steal this node away.
  const removeKeyword = (keyword: string) => {
    if (!draft) return
    const wasLast = draft.keywords.length === 1
    setDraft({ ...draft, keywords: draft.keywords.filter((k) => k !== keyword) })
    if (wasLast) addKeywordRef.current?.focus()
  }

  // A bransje change only means something after a Brreg pass, so it syncs immediately, exactly
  // as a coverage change does. A keywords-only change waits for the next ordinary sync.
  const handleSave = async () => {
    if (!draft || !loaded) return
    setSaving(true)
    setSaveError(null)
    const codesChanged =
      JSON.stringify(draft.naeringskoder) !== JSON.stringify(loaded.naeringskoder)
    try {
      const written = await api.put<FocusConfigDto>('/api/config/focus', draft)
      setLoaded(written)
      setDraft(written)
    } catch (err) {
      setSaveError(
        t('focus.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    if (!codesChanged) {
      setSaving(false)
      announce(t('focus.savedNoSync'))
      return
    }
    // Mirrors CoverageSection's three-way split (started / already busy / failed to start) —
    // a sync that never starts must never be announced as if it did. Reuses coverage's i18n
    // keys since that wording ("Lagret — …") fits a saved-and-syncing focus change just as well.
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

  const handleBackfillConfirm = async () => {
    setBackfillOpen(false)
    try {
      await api.post('/api/sync?full=1')
      announce(t('focus.backfillStarted'))
    } catch (err) {
      announce(
        t(
          err instanceof ApiError && err.status === 409 ? 'sync.alreadyRunning' : 'sync.startFailed'
        )
      )
    }
  }

  const codeInputTrimmed = codeInput.trim()
  const related =
    draft && codeInputTrimmed ? relatedCode(codeInputTrimmed, draft.naeringskoder) : undefined
  const coveredWarning = related ? coveredMessage(codeInputTrimmed, related, t) : null

  return (
    <section aria-labelledby="focus-config-heading" className="card settings-group stack">
      <h2 id="focus-config-heading">{t('focus.heading')}</h2>
      <p className="help">{t('focus.hint')}</p>

      {(loadFailed || saveError) && (
        <p role="status" className="alert alert-danger cluster cluster-sm">
          {loadFailed ? t('focus.loadError') : saveError}
          {!draft && (
            <button type="button" className="btn btn-ghost" onClick={load}>
              {t('common.retry')}
            </button>
          )}
        </p>
      )}

      {draft && (
        <>
          <fieldset className="stack" disabled={readOnly} aria-label={t('focus.heading')}>
            <fieldset className="stack stack-sm">
              <legend>{t('focus.bransjerLegend')}</legend>
              <ul className="focus-chip-list">
                {draft.naeringskoder.map((code) => (
                  <li key={code} className="focus-chip badge">
                    <span>{code}</span>
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      aria-label={t('focus.removeCode', { code })}
                      onClick={() => removeCode(code)}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>

              <form className="cluster cluster-sm focus-add-row" onSubmit={handleAddCode}>
                <div className="field">
                  <label className="label" htmlFor="focus-add-code">
                    {t('focus.addCode')}
                  </label>
                  <input
                    id="focus-add-code"
                    ref={addCodeRef}
                    className="input"
                    type="text"
                    value={codeInput}
                    onChange={(event) => {
                      setCodeInput(event.target.value)
                      setPreviewText(null)
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => preview(codeInputTrimmed)}
                >
                  {t('focus.previewButton')}
                </button>
                <button type="submit" className="btn btn-ghost">
                  {t('focus.addCodeToList')}
                </button>
              </form>
              {coveredWarning && <p className="help">{coveredWarning}</p>}
              {previewText && (
                <p role="status" className="help">
                  {previewText}
                </p>
              )}

              <button type="button" className="btn btn-ghost" onClick={handleAddRecommended}>
                {t('focus.recommended')}
              </button>
            </fieldset>

            <fieldset className="stack stack-sm">
              <legend>{t('focus.keywordsLegend')}</legend>
              <p className="help">{t('focus.keywordsHint')}</p>
              <ul className="focus-chip-list">
                {draft.keywords.map((keyword) => (
                  <li key={keyword} className="focus-chip badge">
                    <span>{keyword}</span>
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      aria-label={t('focus.removeKeyword', { keyword })}
                      onClick={() => removeKeyword(keyword)}
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </li>
                ))}
              </ul>

              <form className="cluster cluster-sm focus-add-row" onSubmit={handleAddKeyword}>
                <div className="field">
                  <label className="label" htmlFor="focus-add-keyword">
                    {t('focus.addKeyword')}
                  </label>
                  <input
                    id="focus-add-keyword"
                    ref={addKeywordRef}
                    className="input"
                    type="text"
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-ghost">
                  {t('focus.addKeywordToList')}
                </button>
              </form>
            </fieldset>
          </fieldset>

          {!readOnly && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {t('focus.save')}
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setBackfillOpen(true)}
            >
              {t('focus.backfillButton')}
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={backfillOpen}
        title={t('focus.backfillConfirmTitle')}
        confirmLabel={t('focus.backfillButton')}
        onConfirm={handleBackfillConfirm}
        onCancel={() => setBackfillOpen(false)}
      >
        <p>{t('focus.backfillConfirmBody')}</p>
      </ConfirmDialog>
    </section>
  )
}
