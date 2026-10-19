import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Focus } from '../context/focus'
import { KNOWN_CATEGORIES } from '../context/focus'
import { useT } from '../i18n'
import { ApiError, api } from '../lib/api'
import {
  type CoverageDraft,
  effectiveDraft,
  fromDiscoveryConfig,
  NO_OTHERS,
  toDiscoveryRequest,
  toFocusSeed,
} from '../lib/coverage'
import { discoveryQuery, kommunerQuery, queryKeys } from '../lib/queries'
import type { KommuneDto } from '../lib/types'
import { CoverageFields } from './CoverageFields'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

interface Props {
  open: boolean
  /** The render lens, seeded from the chosen scope. Persisted once the scope is written; on a
   * failed PUT it is session-only, so the dialog returns on the next launch. */
  onSaveFocus: (focus: Focus, options: { persist: boolean }) => void
  /** The scope was written and the sync started: the parent may close the dialog. */
  onDone: () => void
  onDismiss: () => void
}

const DEFAULT_DRAFT: CoverageDraft = { fylke: '', kommuner: [], others: NO_OTHERS }

/** First-run prompt v2 (spec v3.4 Part B): the region step is scope + lens. It prefills from the
 * server's current discovery scope, lists the fylke's kommuner from /api/kommuner (degrading to
 * fylke-only when that fails), and Start writes the scope, seeds the focus and triggers a sync.
 * Esc is the only way to defer without choosing. */
export function FirstRunDialog({ open, onSaveFocus, onDone, onDismiss }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useT()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<CoverageDraft>(DEFAULT_DRAFT)
  // undefined = still loading (Start disabled), null = unreachable (fylke-only).
  const [kommuner, setKommuner] = useState<KommuneDto[] | null | undefined>(undefined)
  const [scopeLoaded, setScopeLoaded] = useState(false)
  // Empty coverage (a fresh install, or just after a reset) reads as all of Norway in the
  // draft, the slowest scope there is, so it is not a choice until the person makes one.
  const [chosen, setChosen] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load the current server scope + the kommune list each time the dialog opens. Both are
  // best-effort: no scope → the person picks one, no kommune list → fylke granularity only.
  // Start stays disabled until both have settled and a region is chosen: before that the
  // cascade cannot tell "no list" from "not yet".
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setScopeLoaded(false)
    setChosen(false)
    setKommuner(undefined)
    // staleTime 0: the dialog wants the scope as it is right now, not a cached copy.
    queryClient
      .fetchQuery({ ...discoveryQuery(), staleTime: 0 })
      .then((config) => {
        if (cancelled) return
        setDraft(fromDiscoveryConfig(config))
        setChosen(
          config.allOfNorway || config.municipalities.length > 0 || config.fylker.length > 0
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setScopeLoaded(true)
      })
    queryClient
      .fetchQuery(kommunerQuery())
      .then((list) => {
        if (!cancelled) setKommuner(list)
      })
      .catch(() => {
        if (!cancelled) setKommuner(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, queryClient])

  const toggleCategory = (category: string) => {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const ready = scopeLoaded && kommuner !== undefined && chosen

  const handleStart = async () => {
    if (kommuner === undefined) return
    setSaving(true)
    setError(null)
    const chosen = effectiveDraft(draft, kommuner)
    const focus = toFocusSeed(chosen, categories)
    try {
      await api.put('/api/config/discovery', toDiscoveryRequest(chosen))
      queryClient.invalidateQueries({ queryKey: queryKeys.discovery })
    } catch (err) {
      // The lens still works without the server scope, for this session only, so the dialog
      // comes back next launch; show the error, keep Start as retry.
      onSaveFocus(focus, { persist: false })
      setError(
        t('coverage.saveFailed', { error: err instanceof ApiError ? err.message : String(err) })
      )
      setSaving(false)
      return
    }
    onSaveFocus(focus, { persist: true })
    await api.post('/api/sync').catch(() => {}) // SyncHeader shows progress; a 409 just means it already runs
    setSaving(false)
    onDone()
  }

  return (
    <Dialog
      open={open}
      // Escape is the only way to defer without choosing: the backdrop does not close it, and
      // the parent closing it (after Start) is not a change event.
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) onDismiss()
      }}
    >
      {/* The shell moves focus to its h1 once this closes, so the dialog returns none itself. */}
      <DialogContent initialFocus={headingRef} finalFocus={false}>
        <DialogHeader>
          <DialogTitle ref={headingRef} tabIndex={-1}>
            {t('focus.title')}
          </DialogTitle>
          <DialogDescription>{t('focus.intro')}</DialogDescription>
        </DialogHeader>

        <CoverageFields
          idPrefix="first-run"
          draft={draft}
          onChange={(next) => {
            setDraft(next)
            setChosen(true)
          }}
          kommuner={kommuner}
          placeholder={chosen ? undefined : t('coverage.chooseFylke')}
        />

        <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-medium text-foreground">
            {t('focus.categoriesLegend')}
          </legend>
          <p className="text-small text-muted-foreground">{t('focus.categoriesHint')}</p>
          {KNOWN_CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex min-h-11 items-center gap-2.5 text-body-sm text-foreground"
            >
              <input
                type="checkbox"
                className="size-4.5"
                checked={categories.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              {category}
            </label>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="flex items-center gap-x-2 text-body-sm text-foreground">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button size="touch" onClick={handleStart} disabled={saving || !ready}>
            {t('focus.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
