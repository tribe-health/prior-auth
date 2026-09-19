import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimePhase } from '@/features/session/store/session-store';

const runtime = vi.hoisted(() => ({ phase: 'opening-replica' as RuntimePhase }));

vi.mock('@/app/providers/session-provider', () => ({
  useRuntimePhase: () => runtime.phase,
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, Outlet: () => <p>Protected case content</p> };
});

import { PrivateRuntimeOutlet } from './private-runtime-outlet';

afterEach(cleanup);

const NON_READY_PHASES: RuntimePhase[] = [
  'detecting-environment',
  'checking-session',
  'anonymous',
  'session-unavailable',
  'opening-replica',
  'migrating',
  'hydrating',
  'catching-up',
  'offline-limited',
  'quiescing',
  'recovery-required',
];

describe('private runtime outlet', () => {
  it.each(NON_READY_PHASES)('keeps protected case content closed while runtime phase is %s', (phase) => {
    runtime.phase = phase;
    render(<PrivateRuntimeOutlet />);

    expect(screen.queryByText('Protected case content')).toBeNull();
  });

  it('renders protected case content only after required catch-up reaches ready', () => {
    runtime.phase = 'ready';
    render(<PrivateRuntimeOutlet />);

    expect(screen.getByText('Protected case content')).toBeTruthy();
  });

  it('distinguishes offline-limited and recovery-required states', () => {
    runtime.phase = 'offline-limited';
    const view = render(<PrivateRuntimeOutlet />);
    expect(screen.getByRole('alert').textContent).toContain('Patient data unavailable');

    view.unmount();
    runtime.phase = 'recovery-required';
    render(<PrivateRuntimeOutlet />);
    expect(screen.getByRole('alert').textContent).toContain('Local data needs recovery');
  });
});
