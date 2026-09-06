import { useParams } from 'react-router';

import { EvidenceTimeline } from '../../features/evidence-timeline/components/evidence-timeline';

// The one route that is no longer a placeholder. Every other route in this
// directory still renders RoutePlaceholder, deliberately — this phase builds
// the reference pattern, not the product.

export function Component() {
  const { caseId } = useParams();

  if (!caseId) {
    // Reachable only if the route table and this component disagree about the
    // parameter name. Saying so beats rendering an empty timeline.
    return <p className="p-6 text-sm text-destructive">No case selected.</p>;
  }

  return <EvidenceTimeline caseId={caseId} />;
}
