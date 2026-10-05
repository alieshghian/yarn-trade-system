const baseUrl = import.meta.env.VITE_API_URL ?? ''
let token = sessionStorage.getItem('accessToken')
let permissions = new Set<string>(JSON.parse(sessionStorage.getItem('permissions') ?? '[]') as string[])

export async function login(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  if (!response.ok) throw new Error('Login failed')
  const result = await response.json()
  token = result.accessToken
  sessionStorage.setItem('accessToken', token ?? '')
  sessionStorage.setItem('currentUser', email)
}

export async function api<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}

export class ApiError extends Error {
  constructor(public status: number, public details: Record<string, unknown> | null, message: string) { super(message) }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const validationMessage = payload?.errors && typeof payload.errors === 'object'
      ? Object.values(payload.errors as Record<string, unknown>).flat().filter(x => typeof x === 'string').join(' ')
      : ''
    const fa = document.documentElement.lang !== 'en'
    const permission = typeof payload?.permission === 'string' ? payload.permission : ''
    const message = response.status === 401
      ? (fa ? 'نشست ورود شما منقضی یا نامعتبر شده است. لطفاً دوباره وارد سیستم شوید.' : 'Your session has expired. Please sign in again.')
      : response.status === 403
        ? (fa ? `شما مجوز انجام این عملیات را ندارید.${permission ? ` مجوز لازم: ${permission}` : ''}` : `You do not have permission for this operation.${permission ? ` Required: ${permission}` : ''}`)
        : String(payload?.error ?? (validationMessage || `${response.status} ${response.statusText}`))
    if (response.status === 401) {
      logout()
      window.dispatchEvent(new CustomEvent('auth-expired', { detail: { message } }))
    }
    throw new ApiError(response.status, payload, message)
  }
  return (response.status === 204 ? undefined : payload) as T
}

export async function downloadAttachment(id: string, fileName: string) {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${baseUrl}/api/attachments/${id}`, { headers })
  if (!response.ok) throw new ApiError(response.status, null, `${response.status} ${response.statusText}`)
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function apiFile(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const payload = (response.headers.get('content-type') ?? '').includes('application/json') ? await response.json() : null
    throw new ApiError(response.status, payload, String(payload?.error ?? payload?.detail ?? `${response.status} ${response.statusText}`))
  }
  return { blob: await response.blob(), contentDisposition: response.headers.get('content-disposition') ?? '' }
}

export function isAuthenticated() { return Boolean(token) }
export function setAccessPermissions(values: string[]) { permissions = new Set(values); sessionStorage.setItem('permissions', JSON.stringify(values)) }
export function hasPermission(value: string) { return permissions.has(value) }
export function currentUserKey() { return sessionStorage.getItem('currentUser') ?? 'anonymous' }
export function logout() {
  const currentToken = token
  if (currentToken) void fetch(`${baseUrl}/api/presence/logout`, { method: 'POST', headers: { Authorization: `Bearer ${currentToken}` }, keepalive: true }).catch(() => undefined)
  token = null; permissions.clear(); sessionStorage.removeItem('accessToken'); sessionStorage.removeItem('currentUser'); sessionStorage.removeItem('permissions')
}
