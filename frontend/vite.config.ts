import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(frontendRoot, '..')
const samplerDirectory = resolve(projectRoot, 'desktop/YarnTrade.ColorSampler')
const samplerProject = resolve(samplerDirectory, 'YarnTrade.ColorSampler.csproj')
const samplerExecutable = resolve(samplerDirectory, 'bin/Debug/net10.0-windows/YarnTrade.ColorSampler.exe')

async function samplerIsListening(timeoutMs = 500) {
  try {
    const response = await fetch('http://127.1.0.1:5174/health', { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return false
    const health = await response.json() as { service?: string }
    return health.service === 'yarn-trade-color-sampler'
  } catch { return false }
}

async function waitForSampler(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await samplerIsListening()) return true
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200))
  }
  return false
}

function windowsColorSamplerPlugin() {
  let processHandle: ReturnType<typeof spawn> | undefined
  let startInProgress: Promise<boolean> | undefined

  const ensureSampler = () => {
    if (startInProgress) return startInProgress
    startInProgress = (async () => {
      if (await samplerIsListening()) return true
      const executableTime = existsSync(samplerExecutable) ? statSync(samplerExecutable).mtimeMs : 0
      const sourceFiles = readdirSync(samplerDirectory).filter(name => name.endsWith('.cs') || name.endsWith('.csproj') || name.endsWith('.manifest'))
      const needsBuild = executableTime === 0 || sourceFiles.some(name => statSync(resolve(samplerDirectory, name)).mtimeMs > executableTime)
      if (needsBuild) execFileSync('dotnet', ['build', samplerProject], { cwd: projectRoot, stdio: 'inherit' })
      processHandle = spawn(samplerExecutable, ['--background'], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' })
      processHandle.once('error', error => console.error('Could not start the Yarn Trade color sampler:', error.message))
      processHandle.once('exit', () => { processHandle = undefined })
      return waitForSampler()
    })().finally(() => { startInProgress = undefined })
    return startInProgress
  }

  return {
    name: 'yarn-trade-windows-color-sampler',
    configureServer(server) {
      if (process.platform !== 'win32') return
      server.middlewares.use('/__yarntrade/color-sampler/start', (request, response, next) => {
        if (request.method !== 'POST') { next(); return }
        void ensureSampler().then(ready => {
          response.statusCode = ready ? 204 : 503
          response.end()
        }).catch(error => {
          console.error('Could not prepare the Yarn Trade color sampler:', error)
          response.statusCode = 503
          response.end()
        })
      })
      void ensureSampler().then(ready => { if (!ready) console.error('The Yarn Trade color sampler did not open port 5174.') }).catch(error => console.error('Could not prepare the Yarn Trade color sampler:', error))
      server.httpServer?.once('close', () => { if (processHandle && !processHandle.killed) processHandle.kill() })
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5223'

  return {
    plugins: [react(), windowsColorSamplerPlugin()],
    server: { port: 5173, strictPort: true, proxy: {
      '/api': { target: proxyTarget, configure(proxy) {
        // Overwrite client input with the real browser socket peer; LAN clients cannot inherit loopback trust.
        proxy.on('proxyReq', (request, incoming) => request.setHeader('X-YarnTrade-Development-Client', incoming.socket.remoteAddress ?? 'unknown'))
      } },
      '/color-sampler': { target: 'ws://127.1.0.1:5174', ws: true },
      '/health': proxyTarget
    } }
  }
})
