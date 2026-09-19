import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MemoryRouter,
  Outlet,
  useLocation,
  useRoutes,
  type RouteObject,
} from 'react-router';

import type { CaseDetailRecord } from '@/features/case-queue/model/case-command';
import type { CaseRecord } from '@/features/case-queue/model/case-record';

const coverage = vi.hoisted(() => vi.fn());
const detailProjection = vi.hoisted(() => vi.fn());
const intakeProjection = vi.hoisted(() => vi.fn());
const caseDetail = vi.hoisted(() => vi.fn());
const caseCommand = vi.hoisted(() => vi.fn());

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, createBrowserRouter: vi.fn(() => ({})) };
});
vi.mock('@/app/providers/graph-provider', () => ({
  GraphProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/app/providers/session-provider', () => ({
  SessionAccessBoundary: ({ children }: { children: (session: object, epoch: number) => React.ReactNode }) => children({}, 1),
  useRuntimePhase: () => 'ready',
  useSession: () => ({ sessionId: 'session-1', authorizationRevision: 'auth-1' }),
  useRequiredSession: () => ({ practiceId: 'practice-1' }),
  useSessionEpoch: () => 1,
  useCan: () => true,
}));
vi.mock('@/app/shell/app-shell', () => ({
  AppShell: () => <Outlet />,
  ShellErrorBoundary: () => null,
  ShellLoading: () => <p>Loading…</p>,
}));
vi.mock('@/features/administering-entity/hooks/use-administering-entity-resolution', () => ({
  useAdministeringEntityResolution: coverage,
}));
vi.mock('@/features/case-queue/hooks/use-case-projection', () => ({
  useCaseDetailProjection: detailProjection,
  useCaseIntakeProjection: intakeProjection,
}));
vi.mock('@/features/case-queue/hooks/use-case-detail', () => ({ useCaseDetail: caseDetail }));
vi.mock('@/features/case-queue/hooks/use-case-command', () => ({ useCaseCommand: caseCommand }));

import { appRouteObjects } from './app-routes';

function ResolvedRoutes({ routes }: { readonly routes: RouteObject[] }) {
  return useRoutes(routes);
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

async function resolveCaseRoutes(routes: RouteObject[]): Promise<RouteObject[]> {
  return Promise.all(routes.map(async (route) => {
    let resolved = { ...route };
    if (
      (route.path === '/cases/:caseId' || route.path === '/cases/:caseId/intake')
      && route.lazy
    ) {
      const load = route.lazy as unknown as () => Promise<Partial<RouteObject>>;
      resolved = { ...resolved, ...await load(), lazy: undefined } as RouteObject;
    }
    if (route.children) {
      resolved.children = await resolveCaseRoutes(route.children);
    }
    return resolved;
  }));
}

const SUMMARY: CaseRecord = {
  id: 'case-1',
  practiceId: 'practice-1',
  caseNumber: 'SYNTHETIC-001',
  patientId: 'patient-1',
  surgeonId: 'surgeon-1',
  coordinatorId: null,
  payerId: 'payer-1',
  status: 'intake',
  dateOfService: '2026-09-17',
  gateAffirmedAt: null,
  updatedAt: null,
  revision: 1,
};

const DETAIL: CaseDetailRecord = {
  ...SUMMARY,
  facilityId: null,
  memberId: 'member-1',
  procedureCode: '22840',
  planKey: null,
  data: {},
  gateAffirmedBy: null,
  caseInputRevision: 1,
  statusRevision: 0,
  documentSetRevision: 0,
  createdAt: '2026-09-17T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  detailProjection.mockReturnValue({ status: 'ready', case: SUMMARY, error: null });
  intakeProjection.mockReturnValue({ status: 'ready', case: SUMMARY, error: null });
  coverage.mockReturnValue({
    view: { status: 'error', resolution: null, message: null, pendingCommandId: null },
    blocked: true,
    resolve: vi.fn(),
    reconcile: vi.fn(),
    reload: vi.fn(),
  });
  caseDetail.mockReturnValue({
    loading: false,
    error: null,
    record: DETAIL,
    draft: {
      caseNumber: DETAIL.caseNumber,
      patientId: DETAIL.patientId,
      surgeonId: DETAIL.surgeonId,
      coordinatorId: DETAIL.coordinatorId,
      facilityId: DETAIL.facilityId,
      payerId: DETAIL.payerId,
      memberId: DETAIL.memberId,
      dateOfService: DETAIL.dateOfService,
      procedureCode: DETAIL.procedureCode,
      planKey: DETAIL.planKey,
      data: DETAIL.data,
    },
    reload: vi.fn(),
    updateDraft: vi.fn(),
    resetDraft: vi.fn(),
  });
  caseCommand.mockReturnValue({
    pending: false,
    outcome: null,
    message: null,
    canReconcile: false,
    update: vi.fn(),
    transition: vi.fn(),
    reconcile: vi.fn(),
  });
});

afterEach(cleanup);

describe('production case resolution recovery routes', () => {
  it('navigates from the mounted case detail route to intake guidance and derives focus from full detail', async () => {
    const routes = await resolveCaseRoutes(appRouteObjects);
    render(
      <MemoryRouter initialEntries={['/cases/case-1']}>
        <ResolvedRoutes routes={routes} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'SYNTHETIC-001' })).toBeTruthy();
    const options = coverage.mock.calls.at(-1)?.[1] as { onInputsIncomplete: () => void };
    act(() => options.onInputsIncomplete());

    expect(await screen.findByText(
      'Complete the member, plan, procedure, and service date before continuing.',
    )).toBeTruthy();
    expect(screen.getByTestId('location').textContent)
      .toBe('/cases/case-1/intake?focus=resolution&notice=case_inputs_incomplete');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Plan key')));

    expect(SUMMARY).not.toHaveProperty('memberId');
    expect(caseDetail).toHaveBeenCalledWith('case-1', SUMMARY.revision);
  });
});
