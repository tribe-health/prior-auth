// TJ-ARCH-MOB-001 compliant
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One React application for the browser and the Tauri webview.
// The dev server proxies /api to the Axum service; Tauri reaches the same
// operations through commands instead, so no proxy is involved there.
export default defineConfig({
  plugins: [react()],
  // PGlite ships its own WebAssembly and data bundle; pre-bundling breaks its asset URLs.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
  build: { target: 'es2022', sourcemap: true },
})
