import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5223'

  return {
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': proxyTarget, '/health': proxyTarget } }
  }
})
