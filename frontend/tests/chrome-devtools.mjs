import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'

export async function connectChromeDevTools(browser, profile, executable) {
  let stdout = '', stderr = '', spawnError
  browser.stdout?.setEncoding('utf8').on('data', chunk => { stdout = (stdout + chunk).slice(-8000) })
  browser.stderr?.setEncoding('utf8').on('data', chunk => { stderr = (stderr + chunk).slice(-8000) })
  browser.once('error', error => { spawnError = error })
  const startupError = reason => new Error(
    `Chrome startup failed (${reason}); executable=${executable}; platform=${process.platform}; pid=${browser.pid}; exit=${browser.exitCode}; signal=${browser.signalCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    { cause: spawnError },
  )
  const deadline = Date.now() + 45_000
  const activePortFile = join(profile, 'DevToolsActivePort')
  let endpoint
  while (Date.now() < deadline) {
    if (spawnError) throw startupError(spawnError.message)
    if (browser.exitCode !== null || browser.signalCode !== null) throw startupError('browser exited before publishing its DevTools endpoint')
    try {
      const [port, path] = (await readFile(activePortFile, 'utf8')).trim().split(/\r?\n/)
      if (/^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) < 65536 && /^\/devtools\/browser\/[\da-f-]+$/i.test(path)) {
        endpoint = `ws://127.0.0.1:${port}${path}`
        break
      }
    } catch (error) {
      // The file may be absent or locked while Chrome publishes it.
      if (!['ENOENT', 'EBUSY'].includes(error.code)) throw startupError(error.message)
    }
    await pause(100)
  }
  if (!endpoint) throw startupError('DevToolsActivePort was not ready within 45 seconds')
  const socket = new WebSocket(endpoint)
  try {
    await new Promise((resolveOpen, reject) => {
      const timer = setTimeout(() => reject(startupError('DevTools WebSocket did not open within 10 seconds')), 10_000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(startupError('DevTools WebSocket connection failed')) }, { once: true })
    })
    return socket
  } catch (error) {
    socket.close()
    throw error
  }
}
