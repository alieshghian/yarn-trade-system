const baseUrl = import.meta.env.VITE_API_URL ?? ''
let token = sessionStorage.getItem('accessToken')
let permissions = new Set<string>(JSON.parse(sessionStorage.getItem('permissions') ?? '[]') as string[])

export type EmailChallenge = { requiresVerification: true, challenge: string, resendAfterSeconds: number }
type Session = { accessToken: string }
function storeSession(result: Session, email: string) {
  token = result.accessToken
  sessionStorage.setItem('accessToken', token ?? '')
  sessionStorage.setItem('currentUser', email)
}

export async function authenticationRequest<T>(action: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}/api/auth/${action}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : null
  if (!response.ok) throw new ApiError(response.status, payload, response.status === 429 ? 'Please wait before trying again.' : response.status === 503 ? 'Authentication email delivery is unavailable.' : 'Sign in or verification failed. Check your details or request a new link.')
  return payload as T
}
export async function login(email: string, password: string) {
  const result = await authenticationRequest<EmailChallenge | Session>('login', { email, password })
  if ('accessToken' in result) storeSession(result, email)
  return result
}
export async function verifyEmail(challenge: string, code: string, email: string) {
  storeSession(await authenticationRequest<Session>('verify-email', { challenge, code }), email)
}
let developmentProbe: Promise<boolean> | undefined
export function tryDevelopmentSession(): Promise<boolean> {
  if (!import.meta.env.DEV) return Promise.resolve(false)
  return developmentProbe ??= authenticationRequest<Session>('development-session').then(result => { storeSession(result, 'development'); return true }).catch(() => false)
}

export async function api<T>(path: string): Promise<T> {
  return apiRequest<T>(path)
}

export class ApiError extends Error {
  constructor(public status: number, public details: Record<string, unknown> | null, message: string) { super(message) }
}

export function withRowVersion(path: string, rowVersion?: string) {
  return `${path}${path.includes('?') ? '&' : '?'}rowVersion=${encodeURIComponent(rowVersion ?? '')}`
}
export function isConcurrencyConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409 && error.details?.code === 'CONCURRENCY_CONFLICT'
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
        : response.status === 409 && payload?.code === 'CONCURRENCY_CONFLICT'
          ? (fa ? 'این رکورد توسط کاربر دیگری تغییر کرده است. اطلاعات جدید بارگذاری می‌شود؛ لطفاً آن را بررسی و دوباره اقدام کنید.' : 'Another user changed this record. Reload and review the latest data before trying again.')
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
