import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAnnounce } from '../components/LiveRegion'

type Scope = 'new' | 'category' | 'all'
type Format = 'md' | 'txt' | 'json'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'new', label: 'Nytt' },
  { value: 'category', label: 'Kategori' },
  { value: 'all', label: 'Alt' },
]

const FORMATS: { value: Format; label: string }[] = [
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'txt', label: 'Tekst (.txt)' },
  { value: 'json', label: 'JSON (.json)' },
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
      .catch(() => setError('Kunne ikke laste eksport.'))
  }, [url, categoryReady])

  useEffect(() => {
    load()
  }, [load])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preview)
      announce('Kopiert til utklippstavlen.')
    } catch {
      announce('Kunne ikke kopiere — merk teksten manuelt.')
    }
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={load}>
          Prøv igjen
        </button>
      </p>
    )
  }

  return (
    <div className="eksport-view stack">
      <div className="eksport-controls cluster">
        <div className="field">
          <label className="label" htmlFor="eksport-scope">
            Omfang
          </label>
          <select
            id="eksport-scope"
            className="select"
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {scope === 'category' && (
          <div className="field">
            <label className="label" htmlFor="eksport-category">
              Kategori
            </label>
            <input
              id="eksport-category"
              className="input"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="f.eks. IT"
            />
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="eksport-format">
            Format
          </label>
          <select
            id="eksport-format"
            className="select"
            value={format}
            onChange={(event) => setFormat(event.target.value as Format)}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
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
            Last ned
          </a>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCopy}
            disabled={!categoryReady}
          >
            Kopier
          </button>
        </div>
      </div>

      {!categoryReady ? (
        <p className="text-muted">Skriv inn en kategori for å se forhåndsvisning.</p>
      ) : (
        <div className="panel">
          <pre className="eksport-markdown">{preview}</pre>
        </div>
      )}
    </div>
  )
}
