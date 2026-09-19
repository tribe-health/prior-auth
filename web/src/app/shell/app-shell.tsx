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
import { NavLink, Outlet, useLocation, useParams } from "react-router";

import { CASE_PIPELINE, GLOBAL_NAV, isStepReachable, type CaseGateStatus } from "@/app/navigation/pipeline";
import { useCommittedCaseGate } from "@/app/navigation/use-committed-case-gate";
import { useRequiredSession, useSession, useSessionActions } from "@/app/providers/session-provider";
import { Button } from "@/components/ui/button";
import { can } from "@/shared/model/session";
import { cn } from "@/lib/utils";

function GlobalNav() {
  const session = useSession();
  const { logout } = useSessionActions();

  return (
    <div className="flex w-full min-w-0 shrink-0 items-center gap-1 overflow-x-auto border-b bg-ui-muted/30 p-2 md:w-48 md:flex-col md:items-stretch md:border-b-0 md:border-r md:overflow-x-visible">
      <nav aria-label="Sections" className="flex gap-1 md:flex-col">
        {GLOBAL_NAV.filter((item) => !item.requires || can(session, item.requires)).map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "min-h-11 rounded-md px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                isActive ? "bg-background font-medium" : "text-ui-muted-foreground hover:text-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Button
        type="button"
        variant="ghost"
        className="ml-auto min-h-11 px-3 motion-reduce:transition-none md:mt-auto md:ml-0 md:justify-start"
        aria-label={`Sign out ${session?.displayName ?? 'current user'}`}
        onClick={() => void logout()}
      >
        Sign out
      </Button>
      <span className="sr-only" aria-live="polite">
        Signed in as {session?.displayName}
      </span>
    </div>
  );
}

/**
 * The ten-step pipeline for the open case.
 *
 * A blocked step renders **visible and disabled with a reason**, not hidden.
 * A missing step is a confusing interface; a step that says why it is
 * unavailable is an accurate one.
 */
function CasePipelineNav({ caseId, gateStatus }: { caseId: string; gateStatus: CaseGateStatus }) {
  return (
    <nav aria-label="Case pipeline" className="flex w-full min-w-0 gap-0.5 overflow-x-auto p-2 md:flex-col md:overflow-x-visible">
      {CASE_PIPELINE.map((step) => {
        const reachable = isStepReachable(step, { gateStatus });
        const to = step.path ? `/cases/${caseId}/${step.path}` : `/cases/${caseId}`;

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
                "flex items-baseline gap-2 px-3 py-2 rounded-md text-sm transition-colors motion-reduce:transition-none",
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

function CaseWorkspace({ caseId }: { caseId: string }) {
  const session = useRequiredSession();
  const { pathname } = useLocation();
  const gate = useCommittedCaseGate(caseId, session.practiceId);
  const activeStep = CASE_PIPELINE.find((step) => (
    step.path === null
      ? pathname === `/cases/${caseId}`
      : pathname === `/cases/${caseId}/${step.path}`
  ));
  const activeReachability = activeStep
    ? isStepReachable(activeStep, { gateStatus: gate.status })
    : { kind: 'reachable' as const };

  return (
    <>
      <aside className="w-full min-w-0 shrink-0 border-b md:w-56 md:border-b-0 md:border-r md:overflow-y-auto">
        <CasePipelineNav caseId={caseId} gateStatus={gate.status} />
      </aside>
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {activeReachability.kind === 'reachable' ? (
          <Suspense fallback={<ShellLoading />}>
            <Outlet />
          </Suspense>
        ) : (
          <div className="p-4 sm:p-6">
            <div role="alert" className="rounded-md border border-ui-border bg-ui-muted/30 p-4 text-sm">
              {activeReachability.message}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export function AppShell() {
  const { caseId } = useParams();

  // Below md both navs become horizontal scrolling strips rather than
  // disappearing. Hiding navigation strands a phone user with no way to move
  // between steps, which is a worse failure than a narrow column.
  return (
    <div className="flex h-dvh w-full min-w-0 flex-col overflow-x-hidden md:flex-row">
      <GlobalNav />
      {caseId ? (
        <CaseWorkspace caseId={caseId} />
      ) : (
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <Suspense fallback={<ShellLoading />}>
            <Outlet />
          </Suspense>
        </main>
      )}
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
