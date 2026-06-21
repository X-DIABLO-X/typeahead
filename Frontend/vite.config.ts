import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'

// Detect whether vite is running inside Docker (frontend container) or on the host.
// The Docker DNS resolves "backend" to the backend service, while the host must
// reach the backend via the published port.
const isDocker =
    process.env.VITE_DOCKER === 'true' ||
    process.env.DOCKER === 'true' ||
    fs.existsSync('/.dockerenv')
const proxyTarget = isDocker ? 'http://backend:5000' : 'http://localhost:5100'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Proxy /api requests to the backend.
      // This avoids CORS entirely during development because the browser sees the
      // requests as same-origin (http://localhost:5173/api -> backend on :5000).
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
