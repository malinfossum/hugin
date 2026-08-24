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

function buildUrl(scope: Scope, format: Format, category: string, includeActive: boolean): string {
  const params = new URLSearchParams({ scope, format })
  if (scope === 'category') params.set('category', category)
  // The include-Active checkbox only exists (and only applies) for the All scope — the
  // Søkt/tracker section it controls isn't part of the new/category exports.
  if (scope === 'all' && includeActive) params.set('includeActive', 'true')
  return `/api/extract?${params.toString()}`
}

export function EksportView() {
  const [scope, setScope] = useState<Scope | ''>('')
  const [format, setFormat] = useState<Format>('md')
  const [category, setCategory] = useState('')
  const [includeActive, setIncludeActive] = useState(false)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState<string | null>(null)
  const announce = useAnnounce()
  const t = useT()

  const ready = scope !== '' && (scope !== 'category' || category.trim().length > 0)
  const url = scope !== '' ? buildUrl(scope, format, category.trim(), includeActive) : ''

  const load = useCallback(() => {
    if (!ready) {
      setPreview('')
      return Promise.resolve()
    }
    setError(null)
    return api
      .getText(url)
      .then(setPreview)
      .catch(() => setError(t('export.loadError')))
  }, [url, ready, t])

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
            <option value="" disabled>
              {t('export.scopeChoose')}
            </option>
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

        {scope === 'all' && (
          <label className="cluster cluster-sm eksport-include-active">
            <input
              type="checkbox"
              checked={includeActive}
              onChange={(event) => setIncludeActive(event.target.checked)}
            />
            {t('export.includeActive')}
          </label>
        )}

        <div className="cluster cluster-sm">
          <a
            className="btn btn-primary"
            href={ready ? url : undefined}
            aria-disabled={!ready}
            download
          >
            {t('export.download')}
          </a>
          <button type="button" className="btn btn-ghost" onClick={handleCopy} disabled={!ready}>
            {t('export.copy')}
          </button>
        </div>
      </div>

      {!ready ? (
        <p className="text-muted">
          {scope === '' ? t('export.chooseScopeHint') : t('export.enterCategoryHint')}
        </p>
      ) : (
        <div className="panel">
          <pre className="eksport-markdown">{preview}</pre>
        </div>
      )}
    </div>
  )
}
