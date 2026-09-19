import type { VerifiedSession } from "../../../../web/src/shared/model/session";
import {
  createScopedViewStore,
  viewScope,
  type ScopedViewState,
} from "../../../../web/src/shared/scoped-view-store";

interface FixtureViewState {
  readonly selectedCitationId: string | null;
  readonly evidenceFilter: "all" | "met" | "gap";
}

declare global {
  interface Window {
    __RA18_ROLE__?: string;
    __RA18_FORCE_SHARED_VIEW_STATE__?: boolean;
    ra18CreateViewState?: (
      session: VerifiedSession,
    ) => ScopedViewState<FixtureViewState>;
  }
}

window.ra18CreateViewState = (session) => {
  const role = window.__RA18_ROLE__ === "owner" ? "owner" : "follower";
  const stateRole = window.__RA18_FORCE_SHARED_VIEW_STATE__ ? "owner" : role;
  const runtime = createScopedViewStore<FixtureViewState>(
    viewScope(session, 0, "case-1", `${role}-view`),
    { selectedCitationId: null, evidenceFilter: "all" },
  );
  const published = runtime.capture().publish(() =>
    stateRole === "owner"
      ? { selectedCitationId: "citation-owner", evidenceFilter: "met" }
      : { selectedCitationId: "citation-follower", evidenceFilter: "gap" },
  );
  if (!published) {
    throw new Error(`${role} scoped view state refused its current-scope update`);
  }
  return runtime.store.getState();
};
