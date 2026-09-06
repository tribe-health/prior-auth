/**
 * The application shell.
 *
 * Wraps every authenticated route: global navigation, the ten-step case
 * pipeline, and the boundaries that keep one failing screen from taking down
 * the frame around it.
 *
 * Gating follows ADR-005 — steps 07–10 are evaluated against case state and
 * session capability, never a component flag.
 */
import { Suspense } from "react";
import { NavLink, Outlet, useParams } from "react-router";

import { CASE_PIPELINE, GLOBAL_NAV, isStepReachable } from "@/app/navigation/pipeline";
import { useSession } from "@/app/providers/session-provider";
import { can } from "@/shared/model/session";
import { cn } from "@/lib/utils";

/**
 * Whether the surgeon gate is affirmed for the open case.
 *
 * Placeholder: W7 replaces this with a read of `gate_affirmations` through the
 * entity graph. It returns **false** so the gated steps are locked by default —
 * a stub that defaulted to open would be a stub that silently disables the
 * gate, and this is the one place a wrong default is unsafe.
 */
function useGateAffirmed(_caseId: string | undefined): boolean {
  return false;
}

function GlobalNav() {
  const session = useSession();

  return (
    <nav aria-label="Sections" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-ui-muted/30 p-2 md:flex-col md:border-b-0 md:border-r md:overflow-x-visible">
      {GLOBAL_NAV.filter((item) => !item.requires || can(session, item.requires)).map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          className={({ isActive }) =>
            cn(
              "px-3 py-2 rounded-md text-sm transition-colors",
              isActive ? "bg-background font-medium" : "text-ui-muted-foreground hover:text-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The ten-step pipeline for the open case.
 *
 * A blocked step renders **visible and disabled with a reason**, not hidden.
 * A missing step is a confusing interface; a step that says why it is
 * unavailable is an accurate one.
 */
function CasePipelineNav({ caseId }: { caseId: string }) {
  const gateAffirmed = useGateAffirmed(caseId);

  return (
    <nav aria-label="Case pipeline" className="flex gap-0.5 overflow-x-auto p-2 md:flex-col md:overflow-x-visible">
      {CASE_PIPELINE.map((step) => {
        const reachable = isStepReachable(step, { gateAffirmed });
        const to = step.path ? `/cases/${caseId}/${step.path}` : "/";

        if (reachable.kind !== "reachable") {
          // The REASON is the useful part, and `title` alone does not deliver
          // it: screen readers announce it inconsistently and touch users never
          // see a tooltip. A blocked step that says only "Locked" tells a
          // coordinator nothing about what to do next. aria-describedby puts
          // the sentence into the accessible description.
          return (
            <div
              key={step.id}
              aria-disabled="true"
              aria-describedby={`${step.id}-lock-reason`}
              title={reachable.message}
              className="flex items-baseline gap-2 px-3 py-2 rounded-md text-sm text-ui-muted-foreground/60 cursor-not-allowed"
            >
              <span className="font-mono text-[10px] tabular-nums">{step.index}</span>
              <span>{step.label}</span>
              <span className="ml-auto text-[10px]">Locked</span>
              <span id={`${step.id}-lock-reason`} className="sr-only">
                {reachable.message}
              </span>
            </div>
          );
        }

        return (
          <NavLink
            key={step.id}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-baseline gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive ? "bg-ui-muted font-medium" : "hover:bg-ui-muted/50",
              )
            }
          >
            <span className="font-mono text-[10px] tabular-nums text-ui-muted-foreground">
              {step.index}
            </span>
            <span>{step.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { caseId } = useParams();

  // Below md both navs become horizontal scrolling strips rather than
  // disappearing. Hiding navigation strands a phone user with no way to move
  // between steps, which is a worse failure than a narrow column.
  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <GlobalNav />
      {caseId ? (
        <aside className="shrink-0 border-b md:border-b-0 md:border-r md:w-56 md:overflow-y-auto">
          <CasePipelineNav caseId={caseId} />
        </aside>
      ) : null}
      <main className="flex-1 min-w-0 overflow-auto">
        <Suspense fallback={<ShellLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="p-8 text-sm text-ui-muted-foreground" role="status" aria-live="polite">
      Loading…
    </div>
  );
}

/**
 * Route-level error boundary.
 *
 * Says what failed and what remains usable. Per the brand voice: state the
 * consequence, do not editorialize.
 */
export function ShellErrorBoundary({ error }: { error?: unknown }) {
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return (
    <div className="p-8 max-w-prose" role="alert">
      <h2 className="text-lg font-medium mb-2">This screen could not be shown.</h2>
      <p className="text-sm text-ui-muted-foreground mb-4">{message}</p>
      <p className="text-sm text-ui-muted-foreground">
        Navigation is unaffected — other steps in this case remain available.
      </p>
    </div>
  );
}
