// TJ-ARCH-MOB-001 compliant
// Maps host transport failures onto the entity graph's typed errors. A failure
// the same request would hit again is terminal (no retry): any 4xx, or a host
// error code naming bad input or a missing record. The desktop host has no HTTP
// status, so its code decides. Anything else may be retried by the engine.
import { TerminalError, TransientError } from '@prometheus-ags/entity-graph-react'
import { TransportError } from './transport'

/** Host codes (docs/plan/scaffold-contracts.md) that a retry cannot change. */
const TERMINAL_CODES: ReadonlySet<string> = new Set([
  'invalid_input',
  'not_found',
  'not_implemented',
  'invalid_scope',
  'missing_scope',
  'invalid_run_request',
])

function isTerminal(err: TransportError): boolean {
  if (err.status !== null && err.status >= 400 && err.status < 500) return true
  return err.code !== null && TERMINAL_CODES.has(err.code)
}

export async function asEntityCall<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof TransportError) {
      const opts = err.status === null ? { cause: err } : { status: err.status, cause: err }
      if (isTerminal(err)) throw new TerminalError(err.message, opts)
      throw new TransientError(err.message, opts)
    }
    throw err
  }
}
