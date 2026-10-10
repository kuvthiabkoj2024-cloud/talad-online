const BASE_URL = import.meta.env.VITE_API_URL

/**
 * The API session token. Seller Center is a static SPA on another origin than the API,
 * so it sends the token as a Bearer header (like the mobile app) instead of a cookie.
 */
const TOKEN_KEY = 'talad_seller_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode: the session lasts for this tab only.
  }
}

/** Called when the API says the session is gone (set by AuthProvider). */
let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export class ApiError extends Error {
  readonly status: number
  /** Machine-readable code from the API (e.g. SKU_TAKEN), when it sent one. */
  readonly code: string | undefined
  readonly body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.message === 'string' ? body.message : `HTTP ${status}`)
    this.status = status
    this.code = typeof body.code === 'string' ? body.code : undefined
    this.body = body
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) onUnauthorized()
    throw new ApiError(res.status, body as Record<string, unknown>)
  }
  return body as T
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...init.headers,
    },
  })
  return parse<T>(res)
}

export const send = <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

/** Multipart upload with progress (0–1), for product photos and videos. */
export function upload<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(authHeaders())) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onerror = () => reject(new ApiError(0, { code: 'NETWORK', message: 'Network error' }))
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText || '{}')
      } catch {
        // Non-JSON error page (e.g. a proxy's 413).
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T)
      if (xhr.status === 401) onUnauthorized()
      reject(new ApiError(xhr.status, xhr.status === 413 ? { code: 'FILE_TOO_LARGE', ...body } : body))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
