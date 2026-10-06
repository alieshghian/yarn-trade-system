import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5223'

  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy: {
      '/api': { target: proxyTarget, configure(proxy) {
        // Overwrite client input with the real browser socket peer; LAN clients cannot inherit loopback trust.
        proxy.on('proxyReq', (request, incoming) => request.setHeader('X-YarnTrade-Development-Client', incoming.socket.remoteAddress ?? 'unknown'))
      } },
      '/health': proxyTarget
    } }
  }
})
