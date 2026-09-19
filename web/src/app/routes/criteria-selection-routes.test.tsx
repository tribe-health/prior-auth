import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, useLocation, useRoutes, type RouteObject } from 'react-router';

const criteriaSelection = vi.hoisted(() => vi.fn());

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, createBrowserRouter: vi.fn(() => ({})) };
});
vi.mock('@/app/providers/graph-provider', () => ({ GraphProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/app/providers/session-provider', () => ({
  SessionAccessBoundary: ({ children }: { children: (session: object, epoch: number) => React.ReactNode }) => children({}, 1),
  useRuntimePhase: () => 'ready',
  useSession: () => ({ sessionId: 'session-1', authorizationRevision: 'auth-1' }),
  useRequiredSession: () => ({ practiceId: 'practice-1' }),
  useCan: () => true,
}));
vi.mock('@/app/shell/app-shell', () => ({
  AppShell: () => <Outlet />,
  ShellErrorBoundary: () => null,
  ShellLoading: () => <p>Loading…</p>,
}));
vi.mock('@/features/criteria-selection/hooks/use-criteria-selection', () => ({
  useCriteriaSelection: criteriaSelection,
}));

import { appRouteObjects } from './app-routes';

function ResolvedRoutes({ routes }: { readonly routes: RouteObject[] }) {
  return useRoutes(routes);
}

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

async function resolveCriteriaRoutes(routes: RouteObject[]): Promise<RouteObject[]> {
  return Promise.all(routes.map(async (route) => {
    let resolved = { ...route };
    if (
      (route.path === '/cases/:caseId/policy' || route.path === '/cases/:caseId/pathways')
      && route.lazy
    ) {
      const load = route.lazy as unknown as () => Promise<Partial<RouteObject>>;
      resolved = { ...resolved, ...await load(), lazy: undefined } as RouteObject;
    }
    if (route.children) resolved.children = await resolveCriteriaRoutes(route.children);
    return resolved;
  }));
}

const POLICY = {
  id: 'policy-1', payerId: 'payer-1', name: 'Lumbar fusion medical policy',
  policyNumber: 'SURG-2026-014', version: '4', effectiveFrom: '2026-01-01',
  effectiveTo: null, sourceDocumentId: 'document-1',
} as const;
const CRITERION = {
  id: 'criterion-1', payerId: 'payer-1', practiceId: null, evidenceGrade: 'published',
  policyId: 'policy-1', section: '4.1', ordinal: 1, documentId: 'document-1',
  sourcePageNumber: 11, label: 'Operative-level imaging',
  requirement: 'Imaging documents nerve root compression at the proposed operative level.',
  contentSha256: 'a'.repeat(64), procedureFamily: null, isMandatory: true,
  validFrom: '2026-01-01', validTo: null, supersededBy: null,
} as const;

beforeEach(() => {
  criteriaSelection.mockReturnValue({
    view: {
      status: 'ready', message: null,
      caseRecord: { payerId: 'payer-1', dateOfService: '2026-09-18' },
      resolution: { state: 'resolved', revision: 1 },
      catalog: { criteriaCatalogRevision: 'catalog:criteriaCatalogRevision:r1', policies: [POLICY], criteria: [CRITERION] },
      selection: {
        caseId: 'case-1', resolutionRevision: 'case-1:resolutionRevision:r1',
        criteriaCatalogRevision: 'catalog:criteriaCatalogRevision:r1',
        criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r1',
        criteriaSnapshotId: 'snapshot-1', policy: POLICY, criteria: [CRITERION],
        selectedBy: 'user-1', selectedAt: '2026-09-18T12:00:00Z', state: 'current',
      },
    },
    reload: vi.fn(),
    selectPolicy: vi.fn(),
  });
});

afterEach(cleanup);

describe('mounted criteria selection routes', () => {
  it('navigates from the real policy route to the real pathway route', async () => {
    const routes = await resolveCriteriaRoutes(appRouteObjects);
    render(
      <MemoryRouter initialEntries={['/cases/case-1/policy']}>
        <ResolvedRoutes routes={routes} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Confirm the policy that governs this request' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /Compare pathways/ }));
    expect(await screen.findByRole('heading', { name: 'Review the viable policy pathways' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/cases/case-1/pathways');
  });
});
