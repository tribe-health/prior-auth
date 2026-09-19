import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(webRoot, "../desktop/src-tauri/fixtures/ra18"),
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: path.resolve(webRoot, "dist-ra18"),
    rollupOptions: {
      input: {
        lifecycle: path.resolve(
          webRoot,
          "../desktop/src-tauri/fixtures/ra18/index.html",
        ),
        measurement: path.resolve(
          webRoot,
          "../desktop/src-tauri/fixtures/ra18/measurement.html",
        ),
      },
    },
    target: "es2022",
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "src"),
      "@electric-sql/pglite": path.resolve(
        webRoot,
        "node_modules/@electric-sql/pglite/dist/index.js",
      ),
    },
    preserveSymlinks: true,
  },
});
