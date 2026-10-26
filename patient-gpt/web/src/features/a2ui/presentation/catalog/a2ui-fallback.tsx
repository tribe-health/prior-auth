// TJ-ARCH-MOB-001 compliant
// Fail-closed stand-in for a component or action this catalog does not
// render. It names what was skipped and renders nothing of it.
import { notRenderedLabel } from '../../domain/a2ui-contract'

export function A2uiFallback({ name }: { name: string }) {
  return (
    <span className="a2-fallback" role="note">
      {notRenderedLabel(name)}
    </span>
  )
}
