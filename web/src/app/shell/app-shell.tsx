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
import {
  BriefcaseBusiness,
  ChevronRight,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useParams } from "react-router";

import { CASE_PIPELINE, GLOBAL_NAV, isStepReachable, type CaseGateStatus } from "@/app/navigation/pipeline";
import { useCommittedCaseGate } from "@/app/navigation/use-committed-case-gate";
import { useRequiredSession, useSession, useSessionActions } from "@/app/providers/session-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { can } from "@/shared/model/session";
import { BrandMark } from "@/shared/ui/brand-mark";
import { cn } from "@/lib/utils";

const GLOBAL_ICONS = {
  cases: BriefcaseBusiness,
  settings: Settings,
  admin: ShieldCheck,
} as const;

function GlobalNav({ mobile = false }: { mobile?: boolean }) {
  const session = useSession();
  const { logout } = useSessionActions();

  if (mobile) {
    return (
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))] auto-cols-fr grid-flow-col border-t border-chrome bg-canvas/96 pb-[env(safe-area-inset-bottom)] backdrop-blur-md min-[800px]:hidden"
      >
        {GLOBAL_NAV.filter((item) => !item.requires || can(session, item.requires)).map((item) => {
          const Icon = GLOBAL_ICONS[item.id as keyof typeof GLOBAL_ICONS];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) => cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 px-2 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-subtle transition-colors motion-reduce:transition-none",
                isActive && "bg-accent-tint text-accent",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    );
  }

  return (
    <TooltipProvider delay={250}>
      <aside className="hidden h-dvh w-(--size-nav-rail) shrink-0 overflow-y-auto [&>*]:shrink-0 flex-col items-center border-r border-chrome bg-[#14181C] py-3 text-white min-[800px]:flex">
        <NavLink to="/" className="grid size-11 place-items-center" aria-label="Advanced Spine & Orthopedics cases">
          <BrandMark compact className="size-9 brightness-0 invert" />
        </NavLink>
        <nav aria-label="Primary navigation" className="mt-7 flex w-full flex-col items-center gap-2">
          {GLOBAL_NAV.filter((item) => !item.requires || can(session, item.requires)).map((item) => {
            const Icon = GLOBAL_ICONS[item.id as keyof typeof GLOBAL_ICONS];
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger render={
                  <NavLink
                    to={item.path}
                    aria-label={item.label}
                    className={({ isActive }) => cn(
                      "relative grid size-11 place-items-center rounded-md text-[#B6BEC5] transition-colors hover:bg-white/8 hover:text-white motion-reduce:transition-none",
                      isActive && "bg-white/10 text-[#F0955A] before:absolute before:left-0 before:h-5 before:w-0.5 before:bg-[#F0955A]",
                    )}
                  />
                }>
                  <Icon className="size-5" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <Tooltip>
          <TooltipTrigger render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-auto size-11 text-[#B6BEC5] hover:bg-white/8 hover:text-white"
              aria-label={`Sign out ${session?.displayName ?? 'current user'}`}
              onClick={() => void logout()}
            />
          }>
            <LogOut className="size-5" aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </aside>
      <span className="sr-only" aria-live="polite">
        Signed in as {session?.displayName}
      </span>
    </TooltipProvider>
  );
}

/**
 * The ten-step pipeline for the open case.
 *
 * A blocked step renders **visible and disabled with a reason**, not hidden.
 * A missing step is a confusing interface; a step that says why it is
 * unavailable is an accurate one.
 */
function CasePipelineNav({ caseId, gateStatus, inSheet = false }: { caseId: string; gateStatus: CaseGateStatus; inSheet?: boolean }) {
  return (
    <nav aria-label="Case workflow" className="grid w-full min-w-0 content-start gap-1 p-3">
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
              className="grid min-h-11 grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-sm text-subtle/70 cursor-not-allowed"
            >
              <span className="font-mono text-[10px] tabular-nums">{step.index}</span>
              <span>{step.label}</span>
              <span className="font-mono text-[0.58rem] uppercase tracking-wide">Locked</span>
              <span id={`${step.id}-lock-reason`} className="sr-only">
                {reachable.message}
              </span>
            </div>
          );
        }

        const link = (
          <NavLink
            key={step.id}
            to={to}
            end
            className={({ isActive }) =>
              cn(
                "grid min-h-11 grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors motion-reduce:transition-none",
                isActive ? "bg-accent-tint font-semibold text-accent" : "text-muted hover:bg-raised hover:text-text",
              )
            }
          >
            <span className="font-mono text-[10px] tabular-nums text-ui-muted-foreground">
              {step.index}
            </span>
            <span>{step.label}</span>
            <ChevronRight className="size-3.5 opacity-50" aria-hidden="true" />
          </NavLink>
        );
        return inSheet ? <SheetClose key={step.id} nativeButton={false} render={link} /> : link;
      })}
    </nav>
  );
}

function MobileTopbar({ caseId, gateStatus }: { caseId?: string; gateStatus?: CaseGateStatus }) {
  const session = useSession();
  const { logout } = useSessionActions();
  return (
    <header className={cn(
      "sticky top-0 z-30 flex h-(--size-topbar) shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-chrome bg-canvas/96 px-4 backdrop-blur-md",
      caseId ? "workbench-topbar" : "min-[800px]:hidden",
    )}>
      <NavLink to="/" aria-label="Advanced Spine & Orthopedics cases">
        <BrandMark className="w-36" />
      </NavLink>
      <div className="flex items-center gap-1">
      {caseId && gateStatus ? (
        <Sheet>
          <SheetTrigger render={<Button variant="outline" size="sm" className="min-h-10" aria-label="Open case workflow" />}>
            <Menu aria-hidden="true" /> Workflow
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(23rem,92vw)] bg-surface">
            <SheetHeader className="border-b border-chrome pr-12">
              <SheetTitle className="font-display text-xl">Case workflow</SheetTitle>
              <SheetDescription className="break-all font-mono text-[0.65rem] uppercase tracking-[0.1em]">Case {caseId}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CasePipelineNav caseId={caseId} gateStatus={gateStatus} inSheet />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10"
        aria-label={`Sign out ${session?.displayName ?? 'current user'}`}
        onClick={() => void logout()}
      >
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
      </div>
    </header>
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
    <div className="case-shell min-h-0 min-w-0 flex-1">
      <MobileTopbar caseId={caseId} gateStatus={gate.status} />
      <div className="case-workspace-grid min-h-0 min-w-0 flex-1">
      <aside className="case-context-rail min-h-0 min-w-0 overflow-hidden border-r border-chrome bg-surface">
        <div className="flex h-full min-h-0 w-(--size-context-panel) flex-col">
        <div className="border-b border-chrome px-5 py-5">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-subtle">Active case</p>
          <p className="mt-1 truncate text-sm font-semibold text-text">{caseId}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CasePipelineNav caseId={caseId} gateStatus={gate.status} />
        </div>
        <div className="mt-auto border-t border-chrome px-5 py-4 text-xs leading-5 text-subtle">
          Evidence state and clinical authority remain visible through every step.
        </div>
        </div>
      </aside>
      <main className="workbench-scroll min-h-0 min-w-0 w-full overflow-x-clip overflow-y-auto overscroll-contain pb-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))] min-[800px]:pb-0">
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
      </div>
    </div>
  );
}

export function AppShell() {
  const { caseId } = useParams();

  return (
    <div className="app-shell-grid min-h-dvh w-full min-w-0 bg-canvas">
      <GlobalNav />
      <div className="app-shell-body flex min-h-0 min-w-0 flex-1 flex-col">
        {caseId ? (
          <CaseWorkspace caseId={caseId} />
        ) : (
          <>
            <MobileTopbar />
            <main className="workbench-scroll min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain pb-[calc(var(--size-tabbar)+env(safe-area-inset-bottom))] min-[800px]:pb-0">
              <Suspense fallback={<ShellLoading />}>
                <Outlet />
              </Suspense>
            </main>
          </>
        )}
      </div>
      <GlobalNav mobile />
    </div>
  );
}

export function ShellLoading() {
  return (
    <div className="grid min-h-56 place-items-center p-8 text-sm text-muted" role="status" aria-live="polite">
      <span className="flex items-center gap-3"><span className="size-2 animate-pulse rounded-full bg-accent-vivid motion-reduce:animate-none" />Loading workbench…</span>
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
