# ESLint Configuration Reference
> eslint.config.mjs for Tauri + React 19 + TypeScript strict mode

## eslint.config.mjs (flat config — ESLint 9+)

```javascript
// eslint.config.mjs
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import reactRefreshPlugin from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'src-tauri/target', 'node_modules'] },

  // TypeScript + React base
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks':        reactHooksPlugin,
      'react-refresh':      reactRefreshPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any':          'error',
      '@typescript-eslint/no-unused-vars':           ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion':    'warn',
      '@typescript-eslint/consistent-type-imports':  ['error', { prefer: 'type-imports' }],

      // React Hooks rules
      'react-hooks/rules-of-hooks':   'error',
      'react-hooks/exhaustive-deps':  'warn',

      // React Refresh (Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── TJ-ARCH-MOB-001 layer contract rules ─────────────────────────────
      // Warn when a component file imports from a store directly
      'no-restricted-imports': ['error', {
        patterns: [
          {
            // Components must not import stores — use hooks
            group: ['**/stores/*Store', '**/stores/index'],
            message: 'Components must not import stores directly. Create a hook in hooks/ and import that instead.',
          },
          {
            // Components/hooks must not call invoke() — use stores/api
            group: ['@tauri-apps/api/core'],
            importNames: ['invoke'],
            message: 'invoke() must be called from stores or api/ layers, not components or hooks.',
          },
        ],
      }],

      // General quality rules
      'no-console':                   ['warn', { allow: ['warn', 'error'] }],
      'prefer-const':                 'error',
      'no-var':                       'error',
      'eqeqeq':                       ['error', 'always', { null: 'ignore' }],
      'object-shorthand':             'error',
    },
  },

  // Relax invoke() restriction in store and api layers
  {
    files: ['src/**/{stores,api}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off', // Stores and api/ ARE allowed to use invoke()
    },
  },

  // Test files
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports':              'off',
    },
  },
]
```

## .prettierrc

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "tabWidth": 2,
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

## tsconfig.json (strict mode)

```json
{
  "compilerOptions": {
    "target":                     "ES2022",
    "useDefineForClassFields":    true,
    "lib":                        ["ES2022", "DOM", "DOM.Iterable"],
    "module":                     "ESNext",
    "skipLibCheck":               true,
    "moduleResolution":           "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule":          true,
    "isolatedModules":            true,
    "noEmit":                     true,
    "jsx":                        "react-jsx",
    "strict":                     true,
    "noUnusedLocals":             true,
    "noUnusedParameters":         true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns":          true,
    "noUncheckedIndexedAccess":   true,
    "exactOptionalPropertyTypes": true,
    "baseUrl":                    ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## Recommended VS Code settings (.vscode/settings.json)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "eslint.validate": ["typescript", "typescriptreact"],
  "[typescript]":     { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescriptreact]":{ "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

## Vitest configuration (unit testing)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals:     true,
    setupFiles:  ['./src/test/setup.ts'],
    coverage:    {
      provider:  'v8',
      reporter:  ['text', 'lcov'],
      exclude:   ['node_modules', 'src-tauri', '**/*.d.ts', 'src/test'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri invoke for unit tests
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen:  vi.fn(() => Promise.resolve(() => {})),
  emit:    vi.fn(),
  once:    vi.fn(() => Promise.resolve(() => {})),
}))
```
