// TJ-ARCH-MOB-001 compliant
// UI-only contexts shared by the catalog components. None of them holds
// records: the surface id (so a component can find its own fallback), whether
// text sits inside a control (phrasing content only), and the open modal's
// close handle for the `closeModal` function.
import { createContext } from 'react'

export const SurfaceIdContext = createContext<string | null>(null)
export const InlineTextContext = createContext(false)
export const ModalCloseContext = createContext<(() => void) | null>(null)
