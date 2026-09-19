import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uncertain: false,
  awaitingProjection: false,
  outcome: 'idle',
  result: null as { signedAt: string } | null,
  sign: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));
vi.mock('@/features/drafts/components/targeted-correction-draft', () => ({
  TargetedCorrectionDraft: ({ baseRevision }: { baseRevision: string | null }) => (
    <p>Correction draft revision {baseRevision}</p>
  ),
}));
vi.mock('../hooks/use-letter-signing', () => ({
  useLetterSigning: () => ({
    target: {
      letterId: 'letter-1', caseId: 'case-1', letterVersion: 3, qaRevision: 4,
      signatureVersion: 2, status: 'approved', approvedByActor: true,
      isCurrent: true, gateAffirmed: true, qaComplete: true, sourcesComplete: true,
    },
    result: state.result,
    loading: false,
    message: null,
    outcome: state.outcome,
    submitting: false,
    uncertain: state.uncertain,
    awaitingProjection: state.awaitingProjection,
    sign: state.sign,
    reconcile: state.reconcile,
  }),
}));

import { LetterSigningCard } from './letter-signing-card';

afterEach(() => {
  cleanup();
  state.uncertain = false;
  state.awaitingProjection = false;
  state.outcome = 'idle';
  state.result = null;
  vi.clearAllMocks();
});

describe('letter signing command state', () => {
  it('submits from a fresh authoritative target', () => {
    render(<LetterSigningCard letterId="letter-1" caseId="case-1" />);
    expect(screen.getByText('Correction draft revision 3:4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign letter' }));
    expect(state.sign).toHaveBeenCalledOnce();
  });

  it('replaces signing with reconciliation when the result is uncertain', () => {
    state.uncertain = true;
    render(<LetterSigningCard letterId="letter-1" caseId="case-1" />);
    expect(screen.queryByRole('button', { name: 'Sign letter' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check signing result' }));
    expect(state.reconcile).toHaveBeenCalledOnce();
  });

  it('keeps the command owned while the signed projection is pending', () => {
    state.awaitingProjection = true;
    state.outcome = 'awaiting-projection';
    render(<LetterSigningCard letterId="letter-1" caseId="case-1" />);
    expect(screen.queryByRole('button', { name: 'Sign letter' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check signed letter' }));
    expect(state.reconcile).toHaveBeenCalledOnce();
  });

  it('renders Signed only for a confirmed authoritative projection', () => {
    state.result = { signedAt: '2026-09-09T10:00:00Z' };
    state.outcome = 'conflict';
    const view = render(<LetterSigningCard letterId="letter-1" caseId="case-1" />);
    expect(screen.getByRole('button', { name: 'Sign letter' })).toBeTruthy();
    view.unmount();

    state.outcome = 'confirmed';
    render(<LetterSigningCard letterId="letter-1" caseId="case-1" />);
    expect((screen.getByRole('button', { name: 'Signed' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
