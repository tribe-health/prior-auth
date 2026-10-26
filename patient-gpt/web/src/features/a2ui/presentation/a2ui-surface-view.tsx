// TJ-ARCH-MOB-001 compliant
// One agent surface in the thread. The fill grammar of surfaces.css applies:
// an A2UI surface is the assistant speaking, never a host control.
import { PrometheusA2uiSurface } from '@prometheus-ags/a2ui-react'
import { SurfaceIdContext } from './catalog/render-contexts'
import { useA2uiFailure } from './use-a2ui-state'

export function A2uiSurfaceView({ surfaceId }: { surfaceId: string }) {
  const failure = useA2uiFailure(surfaceId)
  if (failure) return <p className="stopped">{failure}</p>
  return (
    <SurfaceIdContext value={surfaceId}>
      <section className="a2-surface" aria-label="Agent-generated interface">
        <PrometheusA2uiSurface surfaceId={surfaceId} />
      </section>
    </SurfaceIdContext>
  )
}
