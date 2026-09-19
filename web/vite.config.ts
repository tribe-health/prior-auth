import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/self-service': {
        target: process.env.ASO_KRATOS_PROXY_TARGET ?? 'http://127.0.0.1:4433',
        changeOrigin: true,
      },
      '/api/cases': {
        target: process.env.ASO_CLINICAL_GATE_PROXY_TARGET
          ?? process.env.ASO_API_PROXY_TARGET
          ?? 'http://127.0.0.1:8788',
        changeOrigin: !process.env.ASO_CLINICAL_GATE_HOST,
        headers: process.env.ASO_CLINICAL_GATE_HOST
          ? { host: process.env.ASO_CLINICAL_GATE_HOST }
          : undefined,
      },
      '/api': {
        target: process.env.ASO_API_PROXY_TARGET ?? 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
      '/v1/shape': {
        target: process.env.ASO_GATE_PROXY_TARGET ?? 'http://127.0.0.1:4456',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // PGlite ships a ~6MB WASM filesystem bundle. Vite's dependency
    // pre-bundling rewrites the module and breaks the data file's integrity
    // check, so the app dies at startup with:
    //   Error: Invalid FS bundle size: 637 !== 6295316
    // Observed in a browser 2026-09-06. PGlite's own bundler docs require this
    // exclusion: pglite.dev/docs/bundler-support
    exclude: ['@electric-sql/pglite'],
  },
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  test: {
    // jsdom for every test. The logic-only tests do not need it and pay a
    // small startup cost; the alternative is a per-file environment pragma
    // that a new component test will forget, and forgetting it produces a
    // confusing "document is not defined" rather than a clear failure.
    environment: 'jsdom',
    globals: false,
  },
})
