import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api/http-client';
import type { VerifiedSession } from '@/shared/model/session';
import { resetRuntimeCommandRegistryForTests } from '@/shared/runtime-command-registry';
import { signingApi } from '../api/signing-api';
import type { SignLetterResult, SigningTarget } from '../model/signing';
import { useLetterSigning } from './use-letter-signing';

const { sessionEpoch } = vi.hoisted(() => ({ sessionEpoch: { value: 0 } }));

const session: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Dr Rivera',
  capabilities: ['sign_letter'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'membership:1',
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => session,
  useSessionEpoch: () => sessionEpoch.value,
}));

vi.mock('../api/signing-api', () => ({
  signingApi: { readTarget: vi.fn(), sign: vi.fn(), lookup: vi.fn() },
}));

const target: SigningTarget = {
  letterId: 'letter-1',
  caseId: 'case-1',
  letterVersion: 3,
  qaRevision: 4,
  signatureVersion: 2,
  status: 'approved',
  approvedByActor: true,
  isCurrent: true,
  gateAffirmed: true,
  qaComplete: true,
  sourcesComplete: true,
};

const receipt: SignLetterResult = {
  commandId: 'command-1',
  letterId: target.letterId,
  caseId: target.caseId,
  letterVersion: target.letterVersion,
  qaRevision: target.qaRevision,
  signatureId: 'signature-1',
  signatureVersion: target.signatureVersion!,
  signedAt: '2026-09-09T10:00:00Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  sessionEpoch.value = 0;
  resetRuntimeCommandRegistryForTests();
  vi.resetAllMocks();
  vi.mocked(signingApi.readTarget).mockResolvedValue(target);
});

afterEach(() => {
  cleanup();
  resetRuntimeCommandRegistryForTests();
});

describe('letter signing projection confirmation', () => {
  it('reports confirmed only after the signed target agrees with the receipt', async () => {
    vi.mocked(signingApi.readTarget)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ ...target, status: 'signed' });
    vi.mocked(signingApi.sign).mockImplementation(async (_letter, commandId) => ({
      ...receipt,
      commandId,
    }));
    const { result } = renderHook(() => useLetterSigning(target.letterId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.sign());

    expect(result.current.outcome).toBe('confirmed');
    expect(result.current.awaitingProjection).toBe(false);
    expect(result.current.message).toBe('Letter signing confirmed.');
  });

  it('retains ownership until a later read shows the signed projection', async () => {
    vi.mocked(signingApi.sign).mockImplementation(async (_letter, commandId) => ({
      ...receipt,
      commandId,
    }));
    const { result } = renderHook(() => useLetterSigning(target.letterId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.sign());
    expect(result.current.outcome).toBe('awaiting-projection');
    expect(result.current.awaitingProjection).toBe(true);

    vi.mocked(signingApi.lookup).mockResolvedValue({
      ...receipt,
      commandId: vi.mocked(signingApi.sign).mock.calls[0]![1],
    });
    vi.mocked(signingApi.readTarget).mockResolvedValue({ ...target, status: 'signed' });
    await act(async () => result.current.reconcile());

    expect(result.current.outcome).toBe('confirmed');
    expect(result.current.awaitingProjection).toBe(false);
  });

  it('keeps a definitive conflict message while refreshing the target', async () => {
    vi.mocked(signingApi.sign).mockRejectedValue(new ApiError(409, 'letter_version_conflict'));
    const { result } = renderHook(() => useLetterSigning(target.letterId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.sign());

    expect(result.current.outcome).toBe('conflict');
    expect(result.current.message).toBe('letter_version_conflict');
    expect(result.current.result).toBeNull();
  });

  it('never reports Signed when an accepted command cannot be found during reconciliation', async () => {
    vi.mocked(signingApi.sign).mockImplementation(async (_letter, commandId) => ({
      ...receipt,
      commandId,
    }));
    const { result } = renderHook(() => useLetterSigning(target.letterId));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => result.current.sign());
    expect(result.current.acceptedReceipt).not.toBeNull();
    expect(result.current.result).toBeNull();

    vi.mocked(signingApi.lookup).mockRejectedValue(new ApiError(404, 'command_not_found'));
    await act(async () => result.current.reconcile());

    expect(result.current.outcome).toBe('conflict');
    expect(result.current.message).toBe('The prior signing command did not complete. Review the current revision.');
    expect(result.current.acceptedReceipt).toBeNull();
    expect(result.current.result).toBeNull();
  });

  it('clears the target and fences a late read when the session epoch advances', async () => {
    const oldRead = deferred<SigningTarget>();
    const currentTarget = { ...target, letterVersion: target.letterVersion + 1 };
    vi.mocked(signingApi.readTarget)
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce(currentTarget);
    const { result, rerender } = renderHook(
      ({ render }) => {
        void render;
        return useLetterSigning(target.letterId);
      },
      { initialProps: { render: 0 } },
    );

    sessionEpoch.value = 1;
    rerender({ render: 1 });
    expect(result.current).toMatchObject({ target: null, loading: true, message: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.target).toEqual(currentTarget);

    await act(async () => oldRead.resolve(target));
    expect(result.current.target).toEqual(currentTarget);
  });
});
