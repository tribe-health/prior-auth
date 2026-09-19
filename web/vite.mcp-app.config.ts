import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'dist-mcp-app',
    emptyOutDir: true,
    rollupOptions: { input: 'mcp-app.html' },
  },
  resolve: {
    alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src') },
  },
});
