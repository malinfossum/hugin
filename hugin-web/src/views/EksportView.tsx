import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAnnounce } from '../components/LiveRegion'
import { type TranslationKey, useT } from '../i18n'

type Scope = 'new' | 'category' | 'all'
type Format = 'md' | 'txt' | 'json'

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

function buildUrl(scope: Scope, format: Format, category: string): string {
  const params = new URLSearchParams({ scope, format })
  if (scope === 'category') params.set('category', category)
  return `/api/extract?${params.toString()}`
}

export function EksportView() {
  const [scope, setScope] = useState<Scope>('all')
  const [format, setFormat] = useState<Format>('md')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)
  const announce = useAnnounce()
  const t = useT()

  const categoryReady = scope !== 'category' || category.trim().length > 0
  const url = buildUrl(scope, format, category.trim())

  const load = useCallback(() => {
    if (!categoryReady) {
      setPreview('')
      return Promise.resolve()
    }
    setError(null)
    return api
      .getText(url)
      .then(setPreview)
      .catch(() => setError(t('export.loadError')))
  }, [url, categoryReady, t])

  useEffect(() => {
    load()
  }, [load])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview)
      announce(t('export.copiedAnnounce'))
    } catch {
      announce(t('export.copyFailedAnnounce'))
    }
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          {t('common.retry')}
        </button>
      </p>
    )
  }

  return (
    <div className="eksport-view stack">
      <div className="eksport-controls cluster">
        <div className="field">
          <label className="label" htmlFor="eksport-scope">
            {t('export.scope')}
          </label>
          <select
            id="eksport-scope"
            className="select"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            {SCOPE_KEYS.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {scope === 'category' && (
          <div className="field">
            <label className="label" htmlFor="eksport-category">
              {t('export.category')}
            </label>
            <input
              id="eksport-category"
              className="input"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={t('export.categoryPlaceholder')}
            />
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="eksport-format">
            {t('export.format')}
          </label>
          <select
            id="eksport-format"
            className="select"
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
          >
            {FORMAT_KEYS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(f.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="cluster cluster-sm">
          <a
            className="btn btn-primary"
            href={categoryReady ? url : undefined}
            aria-disabled={!categoryReady}
            download
          >
            {t('export.download')}
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCopy}
            disabled={!categoryReady}
          >
            {t('export.copy')}
          </button>
        </div>
      </div>

      {!categoryReady ? (
        <p className="text-muted">{t('export.enterCategoryHint')}</p>
      ) : (
        <div className="panel">
          <pre className="eksport-markdown">{preview}</pre>
        </div>
      )}
    </div>
  )
}
