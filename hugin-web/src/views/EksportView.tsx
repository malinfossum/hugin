import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAnnounce } from '../components/LiveRegion'

function defaultSince(): string {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function EksportView() {
  const [since, setSince] = useState(defaultSince)
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState<string | null>(null)
  const announce = useAnnounce()

  const load = useCallback((sinceValue: string) => {
    setError(null)
    return api
      .get<string>(`/api/export?since=${sinceValue}`)
      .then(setMarkdown)
      .catch(() => setError('Kunne ikke laste eksport.'))
  }, [])

  useEffect(() => {
    load(since)
  }, [since, load])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      announce('Kopiert til utklippstavlen.')
    } catch {
      announce('Kunne ikke kopiere — merk teksten manuelt.')
    }
  }

  if (error) {
    return (
      <p role="status" className="alert alert-danger cluster cluster-sm">
        {error}
        <button type="button" className="btn btn-ghost" onClick={() => load(since)}>
          Prøv igjen
        </button>
      </p>
    )
  }

  return (
    <div className="eksport-view stack">
      <div className="eksport-controls cluster">
        <div className="field">
          <label className="label" htmlFor="eksport-since">
            Siden dato
          </label>
          <input
            id="eksport-since"
            className="input"
            type="date"
            value={since}
            onChange={(event) => setSince(event.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={handleCopy}>
          Kopier
        </button>
      </div>
      <div className="panel">
        <pre className="eksport-markdown">{markdown}</pre>
      </div>
    </div>
  )
}
