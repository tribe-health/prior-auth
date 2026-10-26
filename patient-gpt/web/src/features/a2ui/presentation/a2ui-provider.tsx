// TJ-ARCH-MOB-001 compliant
// Mounted once in the app shell: the official renderer's provider over the
// app-owned runtime. Every surface in the app renders inside it.
import type { ReactNode } from 'react'
import { PrometheusA2uiProvider } from '@prometheus-ags/a2ui-react'
import { useA2uiRuntime } from './use-a2ui-runtime'

export function A2uiProvider({ children }: { children: ReactNode }) {
  return <PrometheusA2uiProvider runtime={useA2uiRuntime()}>{children}</PrometheusA2uiProvider>
}
