import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { type FormEvent, useCallback, useRef, useState } from 'react'
import { useReadOnly } from '../context/readOnly'
import { type T, useT } from '../i18n'
import { ApiError, api } from '../lib/api'
import { useStartSync } from '../lib/mutations'
import { focusConfigQuery, queryKeys, recommendedCodesQuery } from '../lib/queries'
import type { FocusConfigDto, NacePreviewDto } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { useAnnounce } from './LiveRegion'
import { RemovableChip } from './RemovableChip'
import { SettingsSection } from './SettingsSection'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { toast } from './ui/toast'

// Same shape the API validates with, kept in sync deliberately, so the field can reject a typo
// without a round-trip.
const NACE_PATTERN = /^\d{2}(\.\d{1,3})?$/

/** "62.010" is redundant if "62" is already listed, and typing "62" makes an already-listed
 * "62.010" redundant too (ruling 2: the warning works in both directions). Returns the other
 * code in the prefix relationship, or undefined when there isn't one. */
function relatedCode(code: string, existing: string[]): string | undefined {
  return existing.find((c) => c !== code && (code.startsWith(c) || c.startsWith(code)))
}

/** Builds the "already covered" message, always naming the narrower code first regardless of
 * which of the two the user actually typed. A prefix relationship between valid NACE codes
 * always has the shorter (fewer digits) one as the broader industry. */
function coveredMessage(code: string, other: string, t: T): string {
  const narrower = other.length > code.length ? other : code
  const broader = other.length > code.length ? code : other
  return t('focus.covered', { code: narrower, broader })
}

interface Props {
  /** Bumped by SettingsView whenever a coverage save succeeds. Folded into the preview cache
   * key below (not used as a remount key: a coverage save must not discard an unsaved
   * bransje/keyword draft, Task 11 finding 2). A code already previewed under the old coverage
   * still fetches fresh, since the cache key it lived under no longer matches. */
  previewVersion?: number
}

/** Settings → Fokus (spec v3.5 Part B): edits the server's discovery bransjer/keywords through
 * hugin.json, mirroring CoverageSection's shape (load once, keep a draft, one Save) and its
 * conventions for read-only mode, saving and errors. Also carries the Part C full-backfill
 * button. SyncHeader's polling must stay identity-independent (v3.2 trap), so it can't live
 * there. */
export function FocusSection({ previewVersion = 0 }: Props) {
  const { data: loadedData, isError, refetch } = useQuery(focusConfigQuery())
  const loaded = loadedData ?? null
  // Only a load that never produced a config counts, as in CoverageSection.
  const loadFailed = isError && loadedData === undefined
  // What the person has changed since the config loaded: the draft is the server's config until
  // then, and their edits after. A refetch never overwrites an unsaved draft.
  const [edited, setEdited] = useState<FocusConfigDto | null>(null)
  const draft = edited ?? loaded
  // An edit undone by hand (a code added and removed again) leaves nothing to lose. A code or
  // keyword typed but not yet added to its list doesn't count either: it isn't part of the draft.
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(loaded)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [keywordInput, setKeywordInput] = useState('')
  const [backfillOpen, setBackfillOpen] = useState(false)
  const startSync = useStartSync()
  const t = useT()
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const { readOnly } = useReadOnly()
  const addCodeRef = useRef<HTMLInputElement>(null)
  const addKeywordRef = useRef<HTMLInputElement>(null)
  // Cached per code, keyed together with `previewVersion` so a coverage save (which bumps that
  // prop) invalidates every cached count without needing a remount. A count fetched under the
  // old kommuner is a wrong number, not a stale one, but the fix is a version-qualified key
  // (Task 11 finding 2), not throwing away the whole component (and the unsaved draft with it).
  const previewCache = useRef(new Map<string, NacePreviewDto>())

  // Shared by the single-code preview button and the "Legg til anbefalte" total below. Both
  // want the same cache (keyed on `previewVersion`, so a coverage save invalidates every count
  // at once) and the same guarded fetch, and neither should re-request a code the other already
  // resolved. Returns null on any failure (bad response, network, Brreg down). Callers decide
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
    // A format failure is not a Brreg failure. Claiming one (as this used to, via the same
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
    // Ruling 3: only a genuine zero count says "0 bedrifter". A resolved, nonzero count with no
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
    // Spec B5: "A resolved preview is announced". An async count that only ever exists
    // visually is invisible to a screen reader, since nothing else signals it arrived.
    announce(text)
  }

  const handleAddCode = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const code = codeInput.trim()
    if (!NACE_PATTERN.test(code)) {
      // Same format failure as the preview button, and the same honest message. Pressing Add
      // on an invalid code used to no-op silently, which reads as a dead button.
      setPreviewText(t('focus.invalidCode'))
      return
    }
    if (draft.naeringskoder.includes(code)) return
    setEdited({ ...draft, naeringskoder: [...draft.naeringskoder, code] })
    setCodeInput('')
    setPreviewText(null)
  }

  // Same defect class as removeKeyword below: removing the last bransje chip must not let focus
  // fall to <body>. The input never unmounts across this update, so focusing it synchronously
  // here is safe.
  const removeCode = (code: string) => {
    if (!draft) return
    const wasLast = draft.naeringskoder.length === 1
    setEdited({ ...draft, naeringskoder: draft.naeringskoder.filter((c) => c !== code) })
    if (wasLast) addCodeRef.current?.focus()
  }

  // Spec B4: offers exactly the codes not already configured (the `missing` filter below), and
  // and previews (the half that was never built) the total those additions bring in before the
  // user saves. Reuses `resolvePreview`'s cache and guarded fetch rather than a new endpoint.
  const handleAddRecommended = async () => {
    let codes: string[]
    try {
      codes = await queryClient.fetchQuery(recommendedCodesQuery())
    } catch {
      // A dead-looking button is the defect this closes: a failed fetch used to return with
      // nothing shown at all.
      setPreviewText(t('focus.recommendedFailed'))
      return
    }
    if (!draft) return
    const missing = codes.filter((c) => !draft.naeringskoder.includes(c))
    if (missing.length === 0) return
    setEdited({ ...draft, naeringskoder: [...draft.naeringskoder, ...missing] })

    const results = await Promise.all(missing.map((code) => resolvePreview(code)))
    const known = results.filter((r): r is NacePreviewDto => r !== null)
    const total = known.reduce((sum, r) => sum + r.units, 0)
    // A total that is partly unknown must say so rather than under-report (ruling 3's honesty,
    // extended from a single code to a sum of them). Brreg being unreachable for some of the
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
    setEdited({ ...draft, keywords: [...draft.keywords, keyword] })
    setKeywordInput('')
  }

  // Removing the last keyword must not let focus fall to <body>. Land it on the add field
  // instead. The input never unmounts across this update, so focusing it synchronously here
  // (rather than through a pending-focus ref + effect, the pattern other lists use when their
  // removal round-trips through the server) is safe: no re-render can steal this node away.
  const removeKeyword = (keyword: string) => {
    if (!draft) return
    const wasLast = draft.keywords.length === 1
    setEdited({ ...draft, keywords: draft.keywords.filter((k) => k !== keyword) })
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
      queryClient.setQueryData(queryKeys.focusConfig, written)
      setEdited(null)
    } catch (err) {
      setSaveError(
        t('focus.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    if (!codesChanged) {
      setSaving(false)
      toast.add({ type: 'success', title: t('focus.savedNoSync') })
      return
    }
    // Mirrors CoverageSection's three-way split (started / already busy / failed to start).
    // A sync that never starts must never be announced as if it did. Reuses coverage's i18n
    // keys since that wording ("Lagret. Synkroniserer …") fits a saved-and-syncing focus change
    // just as well.
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

  const handleBackfillConfirm = async () => {
    setBackfillOpen(false)
    try {
      await startSync.mutateAsync({ full: true })
      toast.add({ type: 'success', title: t('focus.backfillStarted') })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        toast.add({ type: 'info', title: t('sync.alreadyRunning') })
      else toast.add({ type: 'error', title: t('sync.startFailed'), priority: 'high' })
    }
  }

  const codeInputTrimmed = codeInput.trim()
  const related =
    draft && codeInputTrimmed ? relatedCode(codeInputTrimmed, draft.naeringskoder) : undefined
  const coveredWarning = related ? coveredMessage(codeInputTrimmed, related, t) : null

  return (
    <SettingsSection
      headingId="focus-config-heading"
      title={t('focus.heading')}
      hint={t('focus.hint')}
    >
      {(loadFailed || saveError) && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 border-y border-border py-3 text-body-sm text-foreground"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
          {loadFailed ? t('focus.loadError') : saveError}
          {!draft && (
            <Button variant="link" className="min-h-11" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          )}
        </p>
      )}

      {draft && (
        <>
          <fieldset
            className="m-0 flex min-w-0 flex-col gap-8 border-0 p-0"
            disabled={readOnly}
            aria-label={t('focus.heading')}
          >
            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-medium text-foreground">
                {t('focus.bransjerLegend')}
              </legend>
              <ul className="flex list-none flex-wrap gap-2 ps-0">
                {draft.naeringskoder.map((code) => (
                  <RemovableChip
                    key={code}
                    removeLabel={t('focus.removeCode', { code })}
                    onRemove={() => removeCode(code)}
                  >
                    <span className="tabular-nums">{code}</span>
                  </RemovableChip>
                ))}
              </ul>

              <form className="flex flex-wrap items-end gap-2" onSubmit={handleAddCode}>
                <div className="flex w-full flex-col gap-1.5 sm:w-40">
                  <label htmlFor="focus-add-code" className="text-sm text-muted-foreground">
                    {t('focus.addCode')}
                  </label>
                  <Input
                    id="focus-add-code"
                    ref={addCodeRef}
                    type="text"
                    value={codeInput}
                    onChange={(event) => {
                      setCodeInput(event.target.value)
                      setPreviewText(null)
                    }}
                  />
                </div>
                <Button variant="outline" size="touch" onClick={() => preview(codeInputTrimmed)}>
                  {t('focus.previewButton')}
                </Button>
                <Button type="submit" variant="outline" size="touch">
                  {t('focus.addCodeToList')}
                </Button>
              </form>
              {coveredWarning && (
                <p className="text-small text-muted-foreground">{coveredWarning}</p>
              )}
              {previewText && (
                <p role="status" className="text-body-sm text-foreground">
                  {previewText}
                </p>
              )}

              <Button
                variant="outline"
                size="touch"
                className="self-start"
                onClick={handleAddRecommended}
              >
                {t('focus.recommended')}
              </Button>
            </fieldset>

            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <legend className="mb-1 p-0 text-sm font-medium text-foreground">
                {t('focus.keywordsLegend')}
              </legend>
              <p className="text-small text-muted-foreground">{t('focus.keywordsHint')}</p>
              <ul className="flex list-none flex-wrap gap-2 ps-0">
                {draft.keywords.map((keyword) => (
                  <RemovableChip
                    key={keyword}
                    removeLabel={t('focus.removeKeyword', { keyword })}
                    onRemove={() => removeKeyword(keyword)}
                  >
                    {keyword}
                  </RemovableChip>
                ))}
              </ul>

              <form className="flex flex-wrap items-end gap-2" onSubmit={handleAddKeyword}>
                <div className="flex w-full flex-col gap-1.5 sm:w-64">
                  <label htmlFor="focus-add-keyword" className="text-sm text-muted-foreground">
                    {t('focus.addKeyword')}
                  </label>
                  <Input
                    id="focus-add-keyword"
                    ref={addKeywordRef}
                    type="text"
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                  />
                </div>
                <Button type="submit" variant="outline" size="touch">
                  {t('focus.addKeywordToList')}
                </Button>
              </form>
            </fieldset>
          </fieldset>

          {!readOnly && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button size="touch" onClick={handleSave} disabled={saving}>
                {t('focus.save')}
              </Button>
              <Button variant="outline" size="touch" onClick={() => setBackfillOpen(true)}>
                {t('focus.backfillButton')}
              </Button>
            </div>
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

      <UnsavedChangesGuard dirty={dirty} />
    </SettingsSection>
  )
}
