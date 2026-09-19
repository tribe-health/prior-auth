import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '@/features/session/store/session-store';
import type { VerifiedSession } from '@/shared/model/session';
import { ApiError } from '@/shared/api/http-client';
import { clearRuntimeCommandsForSession } from '@/shared/runtime-command-registry';
import { submissionWorkflowApi, type SubmissionWorkflowApi } from '../api/submission-workflow-api';
import { acknowledgedView, sentPacket, sentView, signedPacket } from '../model/submission-workflow.test-fixtures';
import { createSubmissionCommandOwner, submissionCommandOwner } from './submission-command-owner';

const scope = { caseId: 'case-1', practiceId: 'practice-1', identityId: 'identity-1', sessionId: 'session-1', authorizationRevision: 'r1', epoch: 0 };
const submit = { kind: 'submit', body: { commandId: 'submit-command-1', expectedLetterRevision: 12 } } as const;
const acknowledgement = { kind: 'acknowledge', body: { commandId: 'ack-command-1', submissionId: 'submission-1', payerReference: 'SYNTHETIC-REFERENCE', acknowledgedAt: '2026-09-19T14:00:00Z', pageCount: 6 } } as const;
function apiMock(): SubmissionWorkflowApi { return { packet: vi.fn().mockResolvedValue(signedPacket), receipt: vi.fn().mockResolvedValue(sentView), submit: vi.fn().mockResolvedValue(sentPacket), acknowledge: vi.fn().mockResolvedValue(acknowledgedView) }; }
afterEach(() => { clearRuntimeCommandsForSession(scope.sessionId); vi.restoreAllMocks(); });

describe('submission command ownership', () => {
  it('reconciles an uncertain send by exact command ID without retransmitting', async () => {
    const api = apiMock();
    vi.mocked(api.submit).mockRejectedValueOnce(new ApiError(502, 'upstream failure'));
    vi.mocked(api.packet).mockResolvedValue(sentPacket);
    const owner = createSubmissionCommandOwner(scope, api);
    await owner.run(submit);
    expect(owner.store.getState().pending).toEqual(submit);
    await owner.reconcile();
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(owner.store.getState().pending).toBeNull();
  });
  it('replays the original UUID and revision when the projection has no matching submission', async () => {
    const api = apiMock();
    vi.mocked(api.submit).mockRejectedValueOnce(new ApiError(502, 'upstream failure'));
    const owner = createSubmissionCommandOwner(scope, api);
    await owner.run(submit);
    await owner.reconcile();
    expect(api.submit).toHaveBeenNthCalledWith(2, scope.caseId, scope.practiceId, submit.body);
    expect(owner.store.getState().pending).toBeNull();
  });
  it('does not substitute edited acknowledgement fields for an unresolved payload', async () => {
    const api = apiMock();
    vi.mocked(api.acknowledge).mockRejectedValueOnce(new ApiError(503, 'unavailable'));
    const owner = createSubmissionCommandOwner(scope, api);
    await owner.run(acknowledgement);
    await owner.run({ ...acknowledgement, body: { ...acknowledgement.body, commandId: 'new-command', payerReference: 'edited' } });
    expect(api.acknowledge).toHaveBeenNthCalledWith(2, scope.caseId, scope.practiceId, acknowledgement.body);
  });
  it('keeps a mismatched success response uncertain rather than claiming acknowledgement', async () => {
    const api = apiMock();
    vi.mocked(api.acknowledge).mockResolvedValue({ ...acknowledgedView, receipt: { ...acknowledgedView.receipt!, commandId: 'other-command' } });
    const owner = createSubmissionCommandOwner(scope, api);
    await owner.run(acknowledgement);
    expect(owner.store.getState().pending).toEqual(acknowledgement);
    expect(owner.store.getState().message).toContain('not confirmed');
  });
  it('releases a definitively refused stale revision so the user can review current state', async () => {
    const api = apiMock();
    vi.mocked(api.submit).mockRejectedValue(new ApiError(409, 'stale_revision'));
    const owner = createSubmissionCommandOwner(scope, api);
    await owner.run(submit);
    expect(owner.store.getState().pending).toBeNull();
    expect(owner.store.getState().message).toContain('packet changed');
  });
  it('retains the request across route owners and fences late acknowledgement responses after logout', async () => {
    let complete: ((value: typeof acknowledgedView) => void) | undefined;
    vi.spyOn(submissionWorkflowApi, 'acknowledge').mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const owner = submissionCommandOwner(scope);
    const running = owner.run(acknowledgement);
    expect(submissionCommandOwner({ ...scope })).toBe(owner);
    expect(owner.store.getState().pending).toEqual(acknowledgement);
    clearRuntimeCommandsForSession(scope.sessionId);
    expect(owner.store.getState().pending).toBeNull();
    complete?.(acknowledgedView);
    await running;
    expect(owner.store.getState()).toMatchObject({ pending: null, message: null, busy: false });
    expect(submissionCommandOwner({ ...scope, epoch: 1 })).not.toBe(owner);
  });
  it('retains the exact unresolved acknowledgement across same-session revalidation', async () => {
    vi.spyOn(submissionWorkflowApi, 'acknowledge').mockRejectedValueOnce(new ApiError(503, 'unavailable'));
    vi.spyOn(submissionWorkflowApi, 'receipt').mockResolvedValue(sentView);
    const before = submissionCommandOwner(scope);
    await before.run(acknowledgement);
    clearRuntimeCommandsForSession(scope.sessionId, 'revalidation');
    expect(before.store.getState().pending).toBeNull();
    const after = submissionCommandOwner({ ...scope, epoch: 1 });
    expect(after.store.getState().pending).toEqual(acknowledgement);
    vi.mocked(submissionWorkflowApi.acknowledge).mockResolvedValue(acknowledgedView);
    await after.reconcile();
    expect(submissionWorkflowApi.acknowledge).toHaveBeenNthCalledWith(2, scope.caseId, scope.practiceId, acknowledgement.body);
    expect(after.store.getState().pending).toBeNull();
  });
  it('purges retained commands while revalidation has no mounted owner', async () => {
    vi.spyOn(submissionWorkflowApi, 'submit').mockRejectedValue(new ApiError(503, 'unavailable'));
    await submissionCommandOwner(scope).run(submit);
    clearRuntimeCommandsForSession(scope.sessionId, 'revalidation');
    clearRuntimeCommandsForSession(scope.sessionId, 'purge');
    expect(submissionCommandOwner({ ...scope, epoch: 1 }).store.getState().pending).toBeNull();
  });
  it.each([
    { identityId: 'other-identity' }, { practiceId: 'other-practice' },
    { sessionId: 'other-session' }, { authorizationRevision: 'r2' }, { caseId: 'other-case' },
  ])('does not restore a command into a changed verified scope %j', async (changed) => {
    vi.spyOn(submissionWorkflowApi, 'submit').mockRejectedValue(new ApiError(503, 'unavailable'));
    await submissionCommandOwner(scope).run(submit);
    clearRuntimeCommandsForSession(scope.sessionId, 'revalidation');
    const next = submissionCommandOwner({ ...scope, ...changed, epoch: 1 });
    expect(next.store.getState().pending).toBeNull();
    clearRuntimeCommandsForSession(next.scope.sessionId);
  });

});


describe('submission commands across terminal session transitions', () => {
  const session: VerifiedSession = {
    identityId: scope.identityId, sessionId: scope.sessionId, practiceId: scope.practiceId,
    authorizationRevision: scope.authorizationRevision, userId: 'user-1', displayName: 'Synthetic reviewer',
    capabilities: ['submit'], principal: 'user', expiresAt: '2099-01-01T00:00:00Z',
  };
  it.each(['same-session', 'signed-out', 'unavailable', 'failed', 'changed-identity', 'revoked'] as const)(
    'restores quarantined commands only after same-session success: %s', async (outcome) => {
      vi.spyOn(submissionWorkflowApi, 'submit').mockRejectedValue(new ApiError(503, 'unavailable'));
      const sessionStore = createSessionStore(session, { logout: vi.fn() });
      await submissionCommandOwner(scope).run(submit);
      const attempt = sessionStore.getState().beginRevalidation()!;
      if (outcome === 'same-session') sessionStore.getState().completeRevalidation(attempt, { status: 'authenticated', session });
      if (outcome === 'signed-out') sessionStore.getState().completeRevalidation(attempt, { status: 'none', session: null });
      if (outcome === 'unavailable') sessionStore.getState().completeRevalidation(attempt, { status: 'unreachable', session: null });
      if (outcome === 'failed') sessionStore.getState().failRevalidation(attempt, 'Verification failed.');
      if (outcome === 'changed-identity') sessionStore.getState().completeRevalidation(attempt, { status: 'authenticated', session: { ...session, identityId: 'other-identity' } });
      if (outcome === 'revoked') sessionStore.getState().observeRevocation('Revoked.');
      if (outcome !== 'same-session') sessionStore.getState().installVerifiedSession(session);
      const restored = submissionCommandOwner({ ...scope, epoch: sessionStore.getState().epoch });
      expect(restored.store.getState().pending).toEqual(outcome === 'same-session' ? submit : null);
    },
  );
});
