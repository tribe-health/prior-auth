import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { memoryDraftRepository } from '../services/memory-draft-repository';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic user',
  capabilities: [],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'test:1',
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 1,
}));

import { TargetedCorrectionDraft } from './targeted-correction-draft';

beforeEach(() => {
  memoryDraftRepository.resetForTests();
  memoryDraftRepository.authorize(SESSION, 1);
});

afterEach(() => {
  cleanup();
  memoryDraftRepository.resetForTests();
});

describe('targeted correction draft', () => {
  it('warns about memory-only retention and requires review after remount', () => {
    const first = render(
      <TargetedCorrectionDraft caseId="case-1" letterId="letter-1" baseRevision="3:4" />,
    );
    expect(screen.getByText(/Closing or reloading it will discard this draft/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Correction request'), {
      target: { value: 'Review the synthetic chart date.' },
    });
    expect((screen.getByLabelText('Correction request') as HTMLTextAreaElement).value)
      .toBe('Review the synthetic chart date.');

    const reload = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(reload)).toBe(false);
    expect(reload.defaultPrevented).toBe(true);
    first.unmount();

    render(<TargetedCorrectionDraft caseId="case-1" letterId="letter-1" baseRevision="3:4" />);
    expect(screen.queryByLabelText('Correction request')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    expect((screen.getByLabelText('Correction request') as HTMLTextAreaElement).value)
      .toBe('Review the synthetic chart date.');
  });

  it('does not offer a command that applies or signs a correction', () => {
    render(<TargetedCorrectionDraft caseId="case-1" letterId="letter-1" baseRevision="3:4" />);
    expect(screen.queryByRole('button', { name: /apply|submit|sign/i })).toBeNull();
    expect(screen.getByText(/authorized command must apply it/)).toBeTruthy();
  });
});
