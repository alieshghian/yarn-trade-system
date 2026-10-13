export type WindowsSamplerMessage = { type: 'ready' | 'hover' | 'sample' | 'confirm' | 'edit-custom' | 'back' | 'cancel' | 'error'; color?: string; colors?: string[] }

let socket: WebSocket | null = null
let listener: ((message: WindowsSamplerMessage) => void) | null = null
let pendingOpen: { previousColor: string | null } | null = null

function sendOpen() {
  if (socket?.readyState !== WebSocket.OPEN || !pendingOpen) return
  socket.send(JSON.stringify({ type: 'open', ...pendingOpen }))
  pendingOpen = null
}

export async function openWindowsColorSampler(previousColor: string | null, onMessage: (message: WindowsSamplerMessage) => void): Promise<boolean> {
  listener = onMessage
  const openRequest = { previousColor }
  pendingOpen = openRequest
  if (socket?.readyState === WebSocket.OPEN) { sendOpen(); return true }
  if (socket?.readyState === WebSocket.CONNECTING) return true
  if (isLoopbackHost(window.location.hostname)) {
    try {
      const response = await fetch('/__yarntrade/color-sampler/start', { method: 'POST' })
      if (!response.ok && response.status !== 404) {
        if (pendingOpen === openRequest) { pendingOpen = null; listener?.({ type: 'error' }) }
        return false
      }
    } catch { /* Production servers do not expose Vite's local start endpoint. */ }
    if (pendingOpen !== openRequest) return false
  }
  try {
    const endpoint = new URL('/color-sampler', window.location.href)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(endpoint.toString())
    socket.addEventListener('open', () => { listener?.({ type: 'ready' }); sendOpen() })
    socket.addEventListener('message', event => {
      try { listener?.(JSON.parse(String(event.data)) as WindowsSamplerMessage) }
      catch { listener?.({ type: 'error' }) }
    })
    socket.addEventListener('error', () => listener?.({ type: 'error' }))
    socket.addEventListener('close', () => { socket = null })
    return true
  } catch { socket = null; listener({ type: 'error' }); return false }
}

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

export function stopWindowsColorSampler() {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel' }))
  pendingOpen = null
}

export function finishWindowsColorSampler() {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'finish' }))
  pendingOpen = null
}
