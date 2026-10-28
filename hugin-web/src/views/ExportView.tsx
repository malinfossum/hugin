import { AlertTriangle, Copy, Download } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect, NativeSelectOption } from '../components/ui/native-select'
import { toast } from '../components/ui/toast'
import { type TranslationKey, useT } from '../i18n'
import { api } from '../lib/api'

type Scope = 'new' | 'category' | 'all'
type Format = 'md' | 'txt' | 'json'
type Entries = 'default' | 'all'

const SCOPE_KEYS: { value: Scope; labelKey: TranslationKey }[] = [
  { value: 'new', labelKey: 'export.scopeNew' },
  { value: 'category', labelKey: 'export.scopeCategory' },
  { value: 'all', labelKey: 'export.scopeAll' },
]

const FORMAT_KEYS: { value: Format; labelKey: TranslationKey }[] = [
  { value: 'md', labelKey: 'export.formatMd' },
  { value: 'txt', labelKey: 'export.formatTxt' },
  { value: 'json', labelKey: 'export.formatJson' },
]

function buildUrl(scope: Scope, format: Format, category: string, includeActive: boolean): string {
  const params = new URLSearchParams({ scope, format })
  if (scope === 'category') params.set('category', category)
  // The include-Active checkbox only exists (and only applies) for the All scope. The
  // Søkt/tracker section it controls isn't part of the new/category exports.
  if (scope === 'all' && includeActive) params.set('includeActive', 'true')
  return `/api/extract?${params.toString()}`
}

export function ExportView() {
  const [scope, setScope] = useState<Scope | ''>('')
  const [format, setFormat] = useState<Format>('md')
  const [category, setCategory] = useState('')
  const [entries, setEntries] = useState<Entries>('default')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const requestSeq = useRef(0)

  const includeActive = entries === 'all'
  const ready = scope !== '' && (scope !== 'category' || category.trim().length > 0)
  const url = scope !== '' ? buildUrl(scope, format, category.trim(), includeActive) : ''

  const load = useCallback(() => {
    if (!ready) {
      setPreview('')
      return Promise.resolve()
    }
    setError(null)
    const seq = ++requestSeq.current
    return api
      .getText(url)
      .then((text) => {
        if (seq === requestSeq.current) setPreview(text)
      })
      .catch(() => {
        if (seq === requestSeq.current) setError(t('export.loadError'))
      })
  }, [url, ready, t])

  useEffect(() => {
    load()
  }, [load])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview)
      toast.add({ type: 'success', title: t('export.copiedAnnounce') })
    } catch {
      toast.add({ type: 'error', title: t('export.copyFailedAnnounce'), priority: 'high' })
    }
  }

  if (error) {
    return (
      <p
        role="status"
        className="mt-6 flex flex-wrap items-center gap-x-3 border-y border-border py-3 font-sans text-body-sm md:mt-10"
      >
        <AlertTriangle aria-hidden="true" className="size-4 text-destructive" />
        {error}
        <Button variant="link" className="min-h-11" onClick={load}>
          {t('common.retry')}
        </Button>
      </p>
    )
  }

  return (
    <div className="flex flex-col pt-6 font-sans md:pt-10">
      {/* The page head (DESIGN.md): the view's name in the headline size, its context under it. */}
      <h2 className="font-heading text-2xl font-semibold text-foreground md:text-headline">
        {t('export.heading')}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('export.context')}</p>
      <div className="mt-7 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-scope" className="text-sm text-muted-foreground">
            {t('export.scope')}
          </label>
          <NativeSelect
            id="export-scope"
            size="touch"
            className="w-full md:w-40"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            <NativeSelectOption value="" disabled>
              {t('export.scopeChoose')}
            </NativeSelectOption>
            {SCOPE_KEYS.map((s) => (
              <NativeSelectOption key={s.value} value={s.value}>
                {t(s.labelKey)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {scope === 'category' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-category" className="text-sm text-muted-foreground">
              {t('export.category')}
            </label>
            <Input
              id="export-category"
              type="text"
              className="md:w-56"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t('export.categoryPlaceholder')}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="export-format" className="text-sm text-muted-foreground">
            {t('export.format')}
          </label>
          <NativeSelect
            id="export-format"
            size="touch"
            className="w-full md:w-auto"
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
          >
            {FORMAT_KEYS.map((f) => (
              <NativeSelectOption key={f.value} value={f.value}>
                {t(f.labelKey)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {scope === 'all' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="export-entries" className="text-sm text-muted-foreground">
              {t('export.entriesLabel')}
            </label>
            <NativeSelect
              id="export-entries"
              size="touch"
              className="w-full md:w-auto"
              value={entries}
              onChange={(event) => setEntries(event.target.value as Entries)}
            >
              <NativeSelectOption value="default">{t('export.entriesDefault')}</NativeSelectOption>
              <NativeSelectOption value="all">{t('export.entriesAll')}</NativeSelectOption>
            </NativeSelect>
          </div>
        )}

        <div className="flex gap-2 md:ms-auto">
          {/* A link styled as the primary button: the export is a file the browser downloads. */}
          <a
            className={cn(
              buttonVariants({ size: 'touch' }),
              'flex-1 no-underline aria-disabled:pointer-events-none aria-disabled:opacity-50 md:flex-none'
            )}
            href={ready ? url : undefined}
            aria-disabled={!ready}
            download
          >
            <Download aria-hidden="true" />
            {t('export.download')}
          </a>
          <Button
            variant="outline"
            size="touch"
            className="flex-1 md:flex-none"
            onClick={handleCopy}
            disabled={!ready}
          >
            <Copy aria-hidden="true" />
            {t('export.copy')}
          </Button>
        </div>
      </div>

      {!ready ? (
        <p className="mt-6 text-body-sm text-muted-foreground">
          {scope === '' ? t('export.chooseScopeHint') : t('export.enterCategoryHint')}
        </p>
      ) : (
        // The preview sits on the sheet between hairlines, in a monospace face so the file's
        // own layout (markdown, columns, JSON) reads as it will be saved.
        <pre className="mt-6 overflow-x-auto border-y border-border py-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
          {preview}
        </pre>
      )}
    </div>
  )
}
