// TJ-ARCH-MOB-001 compliant
// Chooses the host transport once at boot. This detects the host runtime
// (Tauri webview or browser), never the operating system.
import { createHttpTransport } from './http-transport'
import { createTauriTransport } from './tauri-transport'
import type { PatientGptTransport } from './transport'

export function isTauriHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function selectTransport(): PatientGptTransport {
  return isTauriHost() ? createTauriTransport() : createHttpTransport()
}
