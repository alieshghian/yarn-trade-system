const baseUrl = import.meta.env.VITE_API_URL ?? ''
let token = sessionStorage.getItem('accessToken')
let permissions = new Set<string>(JSON.parse(sessionStorage.getItem('permissions') ?? '[]') as string[])

export type EmailChallenge = { requiresVerification: true, challenge: string, resendAfterSeconds: number }
type Session = { accessToken: string; refreshToken?:string }
let refreshing:Promise<boolean>|undefined
let expiryReported=false
function storeSession(result: Session, email: string) {
  expiryReported=false
  token = result.accessToken
  if(result.refreshToken)sessionStorage.setItem('refreshToken',result.refreshToken);else sessionStorage.removeItem('refreshToken')
  sessionStorage.setItem('accessToken', token ?? '')
  sessionStorage.setItem('currentUser', email)
}

export async function authenticationRequest<T>(action: string, body?: unknown): Promise<T> {
  const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),15_000)
  try{
  const response = await fetch(`${baseUrl}/api/auth/${action}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', signal:controller.signal, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = (response.headers.get('content-type') ?? '').includes('json') ? await response.json() : null
  if (!response.ok) throw new ApiError(response.status, payload, response.status === 429 ? 'Please wait before trying again.' : response.status === 503 ? 'Authentication email delivery is unavailable.' : 'Sign in or verification failed. Check your details or request a new link.')
  return payload as T
  }catch(error){if(controller.signal.aborted)throw new ApiError(408,null,document.documentElement.lang==='fa'?'پاسخ ورود دریافت نشد؛ دوباره تلاش کنید.':'Sign-in timed out. Please try again.');throw error}finally{window.clearTimeout(timer)}
}
export async function login(email: string, password: string) {
  const result = await authenticationRequest<EmailChallenge | Session>('login', { email, password })
  if ('accessToken' in result) storeSession(result, email)
  return result
}
export async function verifyEmail(challenge: string, code: string, email: string) {
  storeSession(await authenticationRequest<Session>('verify-email', { challenge, code }), email)
}
export function tryDevelopmentSession(profile: 'developer'|'manager'|'user' = 'developer'): Promise<boolean> {
  if (!import.meta.env.DEV) return Promise.resolve(false)
  return (profile==='developer' ? authenticationRequest<Session>('development-session') : authenticationRequest<Session>('development-profile-session',{profile})).then(result => { storeSession(result, 'development'); return true }).catch(() => false)
}

// One refresh for concurrent 401s. Retry only explicit authentication rejection,
// never a network failure (a write may already have reached the server).
async function refreshSession(rejectedToken:string|null):Promise<boolean>{
  if(token!==rejectedToken)return Boolean(token)
  if(refreshing)return refreshing
  const refreshToken=sessionStorage.getItem('refreshToken')
  if(!refreshToken)return false
  refreshing=(async()=>{try{
    const result=await authenticationRequest<Session>('refresh',{refreshToken})
    if(token!==rejectedToken)return Boolean(token)
    storeSession(result,sessionStorage.getItem('currentUser')??'');return true
  }catch{return false}})().finally(()=>{refreshing=undefined})
  return refreshing
}
async function authenticatedFetch(path:string,init:RequestInit={}){
  const rejectedToken=token
  let requestToken=token
  const request=()=>{requestToken=token;const headers=new Headers(init.headers);if(token)headers.set('Authorization','Bearer '+token);else headers.delete('Authorization');return fetch(baseUrl+path,{...init,headers})}
  let response=await request()
  if(response.status===401&&await refreshSession(rejectedToken))response=await request()
  if(response.status===401&&token&&token===requestToken&&!expiryReported){expiryReported=true;window.dispatchEvent(new CustomEvent('auth-expired'))}
  return response
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
  const response = await authenticatedFetch(path, { ...init, headers })
  const contentType = response.headers.get('content-type') ?? ''
  const payload = /\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType) ? await response.json() : null
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
          : String(typeof payload==='string' ? payload : payload?.error ?? (validationMessage || payload?.detail || payload?.title || `${response.status} ${response.statusText}`))

    throw new ApiError(response.status, payload, message)
  }
  return (response.status === 204 ? undefined : payload) as T
}

export async function downloadAttachment(id: string, fileName: string) {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await authenticatedFetch(`/api/attachments/${id}`, { headers })
  if (!response.ok) throw new ApiError(response.status, null, `${response.status} ${response.statusText}`)
  // Blob downloads must retain the server's canonical type, even when CORS hides disposition.
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  const extension = ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx' } as Record<string, string>)[mime]
  if (!extension) throw new ApiError(415, null, document.documentElement.lang === 'en' ? 'Unsupported attachment type.' : 'نوع پیوست پشتیبانی نمی‌شود.')
  const encodedName = response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encodedName) { try { fileName = decodeURIComponent(encodedName) } catch { /* Keep display metadata as fallback. */ } }
  const displayName = fileName.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f-\u009f:*?"<>|]/g, '').trim().replace(/[. ]+$/, '').slice(0, 180) ?? ''
  const downloadName = (displayName.replace(/\.[^.]*$/, '') || 'document') + extension
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function apiFile(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await authenticatedFetch(path, { ...init, headers })
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
  expiryReported=false;sessionStorage.removeItem('refreshToken');token = null; permissions.clear(); sessionStorage.removeItem('accessToken'); sessionStorage.removeItem('currentUser'); sessionStorage.removeItem('permissions')
}
