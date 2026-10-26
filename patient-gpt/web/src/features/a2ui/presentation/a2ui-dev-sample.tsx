// TJ-ARCH-MOB-001 compliant
// Development builds only (loaded through a2ui-dev-slot): a control that opens
// the sample A2UI surface, and the intent its last action reported.
import { A2uiSurfaceView } from './a2ui-surface-view'
import { useA2uiDevSample } from './use-a2ui-dev-sample'
import { useLatestA2uiIntent } from './use-a2ui-state'

function IntentLine() {
  const intent = useLatestA2uiIntent()
  return (
    <p className="stopped" role="status" aria-live="polite">
      {intent ? `Reported to the app, not applied: ${intent.name}. ${intent.reason}` : 'No surface actions reported yet.'}
    </p>
  )
}

export default function A2uiDevSample() {
  const sample = useA2uiDevSample()
  return (
    <div className="a2-dev">
      <button type="button" className="btn ghost a2-dev-toggle" aria-expanded={sample.open} onClick={sample.toggle}>
        {sample.open ? 'Hide A2UI sample (development build)' : 'Show A2UI sample (development build)'}
      </button>
      {sample.open ? (
        <>
          <A2uiSurfaceView surfaceId={sample.surfaceId} />
          <IntentLine />
        </>
      ) : null}
    </div>
  )
}
