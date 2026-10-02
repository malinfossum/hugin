import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './api'

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api.post', () => {
  it('sends X-Hugin: 1 on writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await api.post('/api/pipeline', { orgnr: '123' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'X-Hugin': '1' })
  })
})

describe('error handling', () => {
  it('surfaces a 403 JSON problem body as ApiError with the bokmål title', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ title: 'Ikke tilgang' }, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/api/pipeline')).rejects.toMatchObject({
      status: 403,
      message: 'Ikke tilgang',
    })
    await expect(api.get('/api/pipeline')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('204 responses', () => {
  it('resolves undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.del('/api/pipeline/123')).resolves.toBeUndefined()
  })
})
