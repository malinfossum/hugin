import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Star } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAnnounce } from '../components/LiveRegion'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select'
import { Textarea } from '../components/ui/textarea'
import { toast } from '../components/ui/toast'
import { useReadOnly } from '../context/readOnly'
import { localeFor, type T, type TranslationKey, useLang, useT } from '../i18n'
import { ApiError } from '../lib/api'
import { displayCompanyName } from '../lib/companyName'
import { formatDate } from '../lib/dates'
import { useSavePipelineEntry } from '../lib/mutations'
import { pipelineLabel } from '../lib/pipelineLabels'
import { pipelineQuery } from '../lib/queries'
import type { PipelineDto, PipelineStatusSlug, TrackResponse } from '../lib/types'

/** The statuses you can pick. */
const STATUSES: PipelineStatusSlug[] = ['active', 'applied', 'answered']

/**
 * The sections on screen. Expired is derived (an active entry whose ads have all expired),
 * never a status.
 */
type Section = PipelineStatusSlug | 'expired'
const SECTIONS: Section[] = ['active', 'applied', 'answered', 'expired']

function sectionFor(entry: PipelineDto): Section {
  return entry.status === 'active' && entry.adsExpired ? 'expired' : entry.status
}

function sectionLabel(t: T, section: Section): string {
  return section === 'expired' ? t('status.expired') : pipelineLabel(t, section)
}

type SortMode = 'starred' | 'updated' | 'name'

const SORT_OPTION_KEYS: { value: SortMode; labelKey: TranslationKey }[] = [
  { value: 'starred', labelKey: 'applications.sortStarred' },
  { value: 'updated', labelKey: 'applications.sortUpdated' },
  { value: 'name', labelKey: 'applications.sortName' },
]

const SORT_STORAGE_KEY = 'hugin-soknader-sortering'

function loadSortMode(): SortMode {
  try {
    const stored = window.localStorage.getItem(SORT_STORAGE_KEY)
    if (stored === 'starred' || stored === 'updated' || stored === 'name') return stored
  } catch {
    /* localStorage unavailable (private mode etc.): fall back to the default */
  }
  return 'starred'
}

function saveSortMode(mode: SortMode): void {
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, mode)
  } catch {
    /* localStorage unavailable: sort choice just won't persist */
  }
}

function sortEntries(entries: PipelineDto[], mode: SortMode, locale: string): PipelineDto[] {
  const copy = [...entries]
  switch (mode) {
    case 'starred':
      return copy.sort((a, b) => Number(b.starred) - Number(a.starred))
    case 'updated':
      return copy.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    case 'name':
      return copy.sort((a, b) => a.companyName.localeCompare(b.companyName, locale))
  }
}

interface FormState {
  status: PipelineStatusSlug
  why: string
  note: string
  svar: string
}

function toFormState(entry: PipelineDto): FormState {
  return {
    status: entry.status,
    why: entry.why,
    note: entry.note ?? '',
    svar: entry.svar ?? '',
  }
}

export function ApplicationsView() {
  const { data: entries = [], isError, isSuccess: loaded, refetch } = useQuery(pipelineQuery())
  // Two separate mutations, so a star toggle's pending state never blocks or clears the form's.
  const saveEntry = useSavePipelineEntry()
  const saveStar = useSavePipelineEntry()
  const [editingOrgnr, setEditingOrgnr] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [warning, setWarning] = useState<{ orgnr: string; message: string } | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>(loadSortMode)
  const announce = useAnnounce()
  const t = useT()
  const { readOnly } = useReadOnly()
  const [lang] = useLang()
  const locale = localeFor(lang)

  const error = isError ? t('applications.loadError') : null
  const formError = saveEntry.error
    ? saveEntry.error instanceof ApiError
      ? saveEntry.error.message
      : t('applications.saveError')
    : null
  // The open edit form holds a change once it no longer matches its entry; just opening it doesn't.
  const editedEntry = entries.find((e) => e.orgnr === editingOrgnr)
  const formDirty =
    form !== null &&
    editedEntry !== undefined &&
    JSON.stringify(form) !== JSON.stringify(toFormState(editedEntry))
  const starPending = saveStar.isPending ? saveStar.variables.orgnr : null

  const startEdit = (entry: PipelineDto) => {
    setEditingOrgnr(entry.orgnr)
    setForm(toFormState(entry))
    saveEntry.reset()
  }

  const cancelEdit = () => {
    setEditingOrgnr(null)
    setForm(null)
    saveEntry.reset()
  }

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
    saveSortMode(mode)
  }

  const handleSubmit = async (orgnr: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form || saveEntry.isPending) return
    let response: TrackResponse
    try {
      response = await saveEntry.mutateAsync({
        orgnr,
        status: form.status,
        why: form.why,
        note: form.note,
        svar: form.svar,
      })
    } catch {
      return // shown from saveEntry.error
    }
    setWarning(response.warning ? { orgnr, message: response.warning } : null)
    setEditingOrgnr(null)
    setForm(null)
    toast.add({ type: 'success', title: t('applications.saved') })
  }

  const toggleStar = async (entry: PipelineDto) => {
    if (saveStar.isPending) return
    let response: TrackResponse
    try {
      response = await saveStar.mutateAsync({
        orgnr: entry.orgnr,
        status: entry.status,
        why: entry.why,
        note: entry.note,
        svar: entry.svar,
        starred: !entry.starred,
      })
    } catch (err) {
      toast.add({
        type: 'error',
        title: err instanceof ApiError ? err.message : t('applications.starError'),
        priority: 'high',
      })
      return
    }
    setWarning(response.warning ? { orgnr: entry.orgnr, message: response.warning } : null)
    announce(entry.starred ? t('applications.starRemoved') : t('applications.starSet'))
  }

  if (error) {
    return (
      <p
        role="status"
        className="mt-6 flex flex-wrap items-center gap-x-3 border-y border-border py-3 font-sans text-body-sm md:mt-10"
      >
        <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
        {error}
        <Button variant="link" className="min-h-11" onClick={() => refetch()}>
          {t('common.retry')}
        </Button>
      </p>
    )
  }

  // The page head (DESIGN.md): the view's own count in the headline size, its context under it.
  const headline = (
    <p className="min-h-8 font-heading text-2xl font-semibold text-balance text-foreground tabular-nums md:min-h-10 md:text-headline">
      {loaded &&
        (entries.length === 0
          ? t('applications.countNone')
          : entries.length === 1
            ? t('applications.countOne')
            : t('applications.count', { n: entries.length }))}
    </p>
  )

  // Four empty columns and a sort control for nothing read as broken: the head and one sentence
  // instead, naming where an entry comes from.
  if (loaded && entries.length === 0) {
    return (
      <div className="flex flex-col pt-6 font-sans md:pt-10">
        {headline}
        <p className="mt-2 text-body-sm text-ink-tertiary">{t('applications.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pt-6 font-sans md:pt-10">
      <div className="flex flex-col gap-x-10 gap-y-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          {headline}
          <p className="text-sm text-muted-foreground">{t('applications.context')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="soknader-sortering" className="text-sm text-muted-foreground">
            {t('applications.sortBy')}
          </label>
          <NativeSelect
            id="soknader-sortering"
            size="touch"
            className="flex-1 md:flex-none"
            value={sortMode}
            onChange={(event) => handleSortChange(event.target.value as SortMode)}
          >
            {SORT_OPTION_KEYS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {t(option.labelKey)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* The pipeline as four columns on the sheet (two on a tablet, stacked on a phone): each
      status a titled column over a hairline, each company a row in it. */}
      <div className="mt-9 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((section) => {
          const sectionEntries = sortEntries(
            entries.filter((e) => sectionFor(e) === section),
            sortMode,
            locale
          )
          const headingId = `pipeline-heading-${section}`
          return (
            <section key={section} aria-labelledby={headingId} className="flex min-w-0 flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <h2 id={headingId} className="font-heading text-xl font-semibold text-foreground">
                  {sectionLabel(t, section)}
                </h2>
                <span aria-hidden="true" className="text-sm text-muted-foreground tabular-nums">
                  {sectionEntries.length}
                </span>
              </div>
              <ul className="mt-2 flex list-none flex-col ps-0">
                {sectionEntries.map((entry) => {
                  const missingWhy = entry.status !== 'active' && !entry.why
                  const isEditing = editingOrgnr === entry.orgnr
                  return (
                    <li
                      key={entry.orgnr}
                      className="flex flex-col gap-1 border-b border-border py-3 text-foreground"
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* An expired entry's name drops to ink-secondary: never read as active. */}
                        <h3
                          className={cn(
                            'min-w-0 pt-2.5 text-base font-medium break-words',
                            section === 'expired' ? 'text-muted-foreground' : 'text-foreground'
                          )}
                        >
                          {displayCompanyName(entry.companyName)}
                        </h3>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            className="-me-2.5 size-11"
                            aria-pressed={entry.starred}
                            aria-label={
                              entry.starred
                                ? t('applications.starRemove')
                                : t('applications.starGive')
                            }
                            disabled={starPending === entry.orgnr}
                            onClick={() => toggleStar(entry)}
                          >
                            <Star
                              aria-hidden="true"
                              className={entry.starred ? 'fill-current' : undefined}
                            />
                          </Button>
                        )}
                      </div>
                      {!isEditing && (
                        <>
                          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                            {missingWhy ? (
                              <span className="font-semibold text-foreground">
                                {t('applications.missingWhy')}
                              </span>
                            ) : (
                              entry.why && (
                                <span className="text-body-sm text-foreground">{entry.why}</span>
                              )
                            )}
                            {entry.note && <span>{entry.note}</span>}
                            {entry.svar && <span>{entry.svar}</span>}
                            <span className="text-small text-ink-tertiary tabular-nums">
                              {formatDate(entry.updated)}
                            </span>
                          </div>
                          {warning?.orgnr === entry.orgnr && (
                            <p role="status" className="text-sm font-medium text-foreground">
                              ⚠ {warning.message}
                            </p>
                          )}
                          {!readOnly && (
                            <Button
                              variant="link"
                              size="xs"
                              className="-ms-2 min-h-11 min-w-11 self-start"
                              onClick={() => startEdit(entry)}
                            >
                              {t('applications.edit')}
                            </Button>
                          )}
                        </>
                      )}
                      {isEditing && form && (
                        <form
                          className="mt-1 flex flex-col gap-3"
                          onSubmit={(event) => handleSubmit(entry.orgnr, event)}
                        >
                          <div className="flex flex-col gap-1.5">
                            <label
                              htmlFor={`status-${entry.orgnr}`}
                              className="text-sm text-muted-foreground"
                            >
                              {t('common.status')}
                            </label>
                            <NativeSelect
                              id={`status-${entry.orgnr}`}
                              size="touch"
                              className="w-full"
                              value={form.status}
                              onChange={(event) =>
                                setForm({
                                  ...form,
                                  status: event.target.value as PipelineStatusSlug,
                                })
                              }
                            >
                              {STATUSES.map((slug) => (
                                <NativeSelectOption key={slug} value={slug}>
                                  {pipelineLabel(t, slug)}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label
                              htmlFor={`why-${entry.orgnr}`}
                              className="text-sm text-muted-foreground"
                            >
                              {t('applications.why')}
                            </label>
                            <Textarea
                              id={`why-${entry.orgnr}`}
                              value={form.why}
                              onChange={(event) => setForm({ ...form, why: event.target.value })}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label
                              htmlFor={`note-${entry.orgnr}`}
                              className="text-sm text-muted-foreground"
                            >
                              {t('applications.note')}
                            </label>
                            <Input
                              id={`note-${entry.orgnr}`}
                              type="text"
                              value={form.note}
                              onChange={(event) => setForm({ ...form, note: event.target.value })}
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label
                              htmlFor={`svar-${entry.orgnr}`}
                              className="text-sm text-muted-foreground"
                            >
                              {t('applications.answer')}
                            </label>
                            <Input
                              id={`svar-${entry.orgnr}`}
                              type="text"
                              value={form.svar}
                              onChange={(event) => setForm({ ...form, svar: event.target.value })}
                            />
                          </div>

                          {formError && (
                            <p
                              role="status"
                              className="flex items-center gap-x-2 text-body-sm text-foreground"
                            >
                              <AlertTriangle
                                aria-hidden="true"
                                className="size-4 shrink-0 text-destructive"
                              />
                              {formError}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="touch">
                              {t('common.save')}
                            </Button>
                            <Button variant="ghost" size="touch" onClick={cancelEdit}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </form>
                      )}
                    </li>
                  )
                })}
              </ul>
              {/* Footnotes under the list, so every column's first row starts on the same line. */}
              {section === 'active' && (
                <p className="mt-3 text-small text-muted-foreground">
                  {t('applications.activeHint')}
                </p>
              )}
              {section === 'expired' && (
                <p className="mt-3 text-small text-muted-foreground">
                  {t('applications.expiredHint')}
                </p>
              )}
            </section>
          )
        })}
      </div>

      <UnsavedChangesGuard dirty={formDirty} />
    </div>
  )
}
