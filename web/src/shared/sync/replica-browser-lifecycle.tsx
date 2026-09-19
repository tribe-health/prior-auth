import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useGraphStoreApi } from "@prometheus-ags/entity-graph-react";

import { GraphProvider, graphStorageKey } from "@/app/providers/graph-provider";
import {
  SessionProvider,
  useAccessState,
  useRuntimePhase,
  useSessionActions,
} from "@/app/providers/session-provider";
import type { SessionService } from "@/features/session/services/session-service";
import type { VerifiedSession } from "@/shared/model/session";
import { quiescePrivateRuntime } from "./runtime-quiescence";
import { REPLICA_TARGETS, entityTypeFor } from "./replica-wiring";
import type { PGliteTable } from "./pglite-schema";

export interface MountedLifecycleSession {
  readonly token: string;
  readonly verified: VerifiedSession;
}

export interface MountedLifecycleConfig {
  readonly primary: MountedLifecycleSession;
  readonly replacement: MountedLifecycleSession;
}

export interface BrowserQualificationConfig extends MountedLifecycleConfig {
  readonly sessionToken: string;
}

interface NetworkEvent {
  readonly label: "primary" | "replacement";
  readonly phase: "completed" | "failed" | "started";
  readonly status?: number;
  readonly time: number;
  readonly url: string;
}

interface GraphSnapshot {
  readonly counts: Record<PGliteTable, number>;
  readonly key: string;
}

export interface MountedLifecycleResult {
  readonly result: "Passed" | "Failed";
  readonly checks: Record<string, boolean>;
  readonly primary: GraphSnapshot;
  readonly replacement: GraphSnapshot;
  readonly timing: Record<string, number>;
  readonly network: readonly NetworkEvent[];
  readonly revokedProbeStatus: number;
}

declare global {
  interface Window {
    __RA11C_REVOKE_SESSION__?: (sessionId: string) => Promise<number>;
  }
}

const EXPECTED_COUNTS: Readonly<Record<PGliteTable, number>> = {
  annotation_types: 4,
  annotations: 0,
  cases: 360,
  case_evidence: 4_320,
  document_statuses: 2_880,
  document_task_statuses: 0,
  evidence_citations: 8_640,
  evidence_states: 3,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), 90_000);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

function graphSnapshot(session: VerifiedSession): GraphSnapshot {
  const state = useGraphStoreApi().getState();
  const counts = Object.fromEntries(REPLICA_TARGETS.map(({ table }) => [
    table,
    Object.keys(state.entities[entityTypeFor(table)] ?? {}).length,
  ])) as Record<PGliteTable, number>;
  return { counts, key: graphStorageKey(session) };
}

function hasExpectedCounts(snapshot: GraphSnapshot): boolean {
  return Object.entries(EXPECTED_COUNTS).every(
    ([table, expected]) => snapshot.counts[table as PGliteTable] === expected,
  );
}

function ProtectedView({
  active,
  onReady,
}: {
  active: MountedLifecycleSession;
  onReady: (snapshot: GraphSnapshot) => void;
}) {
  const snapshot = graphSnapshot(active.verified);
  useEffect(() => onReady(snapshot), [onReady, snapshot.key]);
  return (
    <section data-private-scope={snapshot.key} data-testid="protected-replica">
      {Object.values(snapshot.counts).reduce((sum, value) => sum + value, 0)} rows
    </section>
  );
}

function Controls({ register }: { register: (logout: () => Promise<void>) => void }) {
  const { logout } = useSessionActions();
  const { accessState } = useAccessState();
  const runtimePhase = useRuntimePhase();
  useEffect(() => register(logout), [logout, register]);
  return <output data-access-state={accessState} data-runtime-phase={runtimePhase} />;
}

export async function runMountedLifecycle(
  config: MountedLifecycleConfig,
): Promise<MountedLifecycleResult> {
  const originalFetch = window.fetch.bind(window);
  const network: NetworkEvent[] = [];
  let active = config.primary;
  let activeLabel: NetworkEvent["label"] = "primary";
  let switchFenceAt = Number.POSITIVE_INFINITY;
  let logoutFenceAt = Number.POSITIVE_INFINITY;
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.pathname !== "/v1/shape") return originalFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${active.token}`);
    const label = activeLabel;
    network.push({ label, phase: "started", time: performance.now(), url: url.href });
    try {
      const response = await originalFetch(input, { ...init, headers });
      network.push({
        label,
        phase: "completed",
        status: response.status,
        time: performance.now(),
        url: url.href,
      });
      return response;
    } catch (cause) {
      network.push({ label, phase: "failed", time: performance.now(), url: url.href });
      throw cause;
    }
  };

  const primaryReady = deferred<GraphSnapshot>();
  const replacementReady = deferred<GraphSnapshot>();
  let switchSession!: () => void;
  let logout!: () => Promise<void>;
  const service: SessionService = {
    async revalidate() {
      return { status: "authenticated", session: active.verified };
    },
    async logout() {
      const revoke = window.__RA11C_REVOKE_SESSION__;
      if (!revoke) return "unavailable";
      const status = await revoke(active.verified.sessionId);
      return status === 204 || status === 404 ? "confirmed" : "unavailable";
    },
  };

  function App() {
    const [selected, setSelected] = useState(config.primary);
    const seen = useRef(new Set<string>());
    switchSession = () => {
      active = config.replacement;
      activeLabel = "replacement";
      setSelected(config.replacement);
    };
    const onReady = (snapshot: GraphSnapshot) => {
      if (seen.current.has(snapshot.key)) return;
      seen.current.add(snapshot.key);
      if (snapshot.key === graphStorageKey(config.primary.verified)) {
        primaryReady.resolve(snapshot);
      } else {
        replacementReady.resolve(snapshot);
      }
    };
    return (
      <SessionProvider session={selected.verified} service={service}>
        <Controls register={(action) => { logout = action; }} />
        <GraphProvider fallback={<p data-testid="replica-fenced">Replica fenced</p>}>
          <ProtectedView active={selected} onReady={onReady} />
        </GraphProvider>
      </SessionProvider>
    );
  }

  const container = document.createElement("div");
  container.id = "ra11c-mounted-lifecycle";
  document.body.append(container);
  const root = createRoot(container);
  const timing: Record<string, number> = {};
  try {
    flushSync(() => root.render(<App />));
    const primary = await withTimeout(primaryReady.promise, "primary graph hydration");
    timing.primaryReady = performance.now();
    switchFenceAt = performance.now();
    flushSync(() => switchSession());
    const switchClosedImmediately = !container.querySelector('[data-testid="protected-replica"]');
    timing.switchFenced = performance.now();
    const replacement = await withTimeout(
      replacementReady.promise,
      "replacement graph hydration",
    );
    timing.replacementReady = performance.now();
    const oldGraphAbsent = container.querySelector(
      `[data-private-scope="${CSS.escape(primary.key)}"]`,
    ) === null;
    const noPrimarySuccessAfterFence = !network.some(
      (event) => event.label === "primary"
        && event.phase === "completed"
        && (event.status ?? 500) < 400
        && event.time > switchFenceAt,
    );

    logoutFenceAt = performance.now();
    const logoutPromise = logout();
    const logoutClosedImmediately = !container.querySelector('[data-testid="protected-replica"]');
    timing.logoutFenced = performance.now();
    await withTimeout(logoutPromise, "mounted logout");
    timing.logoutSettled = performance.now();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    const noReplacementSuccessAfterFence = !network.some(
      (event) => event.label === "replacement"
        && event.phase === "completed"
        && (event.status ?? 500) < 400
        && event.time > logoutFenceAt,
    );
    const revoked = await originalFetch("/v1/shape?shape=cases", {
      headers: { authorization: `Bearer ${config.replacement.token}` },
    });
    const checks = {
      logoutClosedImmediately,
      noPostLogoutShapePublication: noReplacementSuccessAfterFence,
      noPostSwitchShapePublication: noPrimarySuccessAfterFence,
      oldGraphAbsent,
      primaryGraphPopulated: hasExpectedCounts(primary),
      realSessionRevoked: revoked.status === 401,
      replacementGraphPopulated: hasExpectedCounts(replacement),
      replacementOpenedAfterFence: timing.replacementReady > timing.switchFenced,
      switchClosedImmediately,
    };
    return {
      result: Object.values(checks).every(Boolean) ? "Passed" : "Failed",
      checks,
      primary,
      replacement,
      timing,
      network,
      revokedProbeStatus: revoked.status,
    };
  } finally {
    root.unmount();
    await quiescePrivateRuntime().catch(() => undefined);
    container.remove();
    window.fetch = originalFetch;
  }
}
