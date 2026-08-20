/** Thin fetch wrapper. Writes always carry X-Hugin: 1 — the API's CSRF gate. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function throwIfError(response: Response): Promise<void> {
  if (response.ok) return
  let title = `Feil (${response.status})`
  try {
    title = (await response.json()).title ?? title
  } catch {
    /* non-JSON body */
  }
  throw new ApiError(response.status, title)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  await throwIfError(response)
  if (response.status === 204) return undefined as T
  const type = response.headers.get('content-type') ?? ''
  return (type.includes('json') ? response.json() : response.text()) as Promise<T>
}

/** Always reads the body as text, regardless of the response's content type — for previewing a
 * file download (e.g. extract's json/md/txt formats) verbatim rather than auto-parsing json. */
async function requestText(path: string): Promise<string> {
  const response = await fetch(path)
  await throwIfError(response)
  return response.text()
}

const writeHeaders = { 'X-Hugin': '1', 'Content-Type': 'application/json' }

export const api = {
  get: <T>(path: string) => request<T>(path),
  getText: (path: string) => requestText(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: writeHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', headers: writeHeaders, body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE', headers: writeHeaders }),
}
