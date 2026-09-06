import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
