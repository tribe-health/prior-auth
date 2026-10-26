// TJ-ARCH-MOB-001 compliant
// Where a run's surface will render. The deterministic runtime emits no A2UI,
// so development builds offer the sample surface here. `import.meta.env.DEV`
// is a build-time constant: in a production build this is `null` and the
// sample module is never emitted.
import { lazy, Suspense } from 'react'

const DevSample = import.meta.env.DEV ? lazy(() => import('./a2ui-dev-sample')) : null

export function A2uiDevSlot() {
  if (!DevSample) return null
  return (
    <Suspense fallback={null}>
      <DevSample />
    </Suspense>
  )
}
