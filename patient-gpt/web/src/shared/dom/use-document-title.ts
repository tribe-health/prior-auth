// TJ-ARCH-MOB-001 compliant
// Window title as shell.js sets it: "PatientGPT · ASO", or "<context> · PatientGPT · ASO".
import { useEffect } from 'react'

export function useDocumentTitle(context: string | null): void {
  useEffect(() => {
    document.title = context ? `${context} · PatientGPT · ASO` : 'PatientGPT · ASO'
  }, [context])
}
