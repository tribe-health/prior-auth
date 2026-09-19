import { ApiError } from '@/shared/api/http-client';
import { clearRuntimeCommandsForSession } from '@/shared/runtime-command-registry';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  resolution: vi.fn(), selection: vi.fn(), evidence: vi.fn(), gate: vi.fn(), generate: vi.fn(), read: vi.fn(), artifacts: vi.fn(), review: vi.fn(), approve: vi.fn(), lookup: vi.fn(),
}));
const generation = vi.hoisted(() => ({ state: { artifacts: null as unknown }, start: vi.fn(), reset: vi.fn() }));
const session = { identityId: 'identity-1', sessionId: 'session-1', authorizationRevision: 'r1', practiceId: 'practice-1' };
vi.mock('@/app/providers/session-provider', () => ({ useRequiredSession: () => session }));
vi.mock('@/features/administering-entity/api/administering-entity-api', () => ({ administeringEntityApi: { read: api.resolution } }));
vi.mock('@/features/criteria-selection/api/criteria-selection-api', () => ({ criteriaSelectionApi: { read: api.selection } }));
vi.mock('@/features/evidence-assembly/api/evidence-assembly-api', () => ({ evidenceAssemblyApi: { read: api.evidence } }));
vi.mock('@/features/surgeon-gate/api/gate-api', () => ({ gateApi: { read: api.gate } }));
vi.mock('../api/letter-workflow-api', () => ({ letterWorkflowApi: { generate: api.generate, read: api.read, review: api.review, approve: api.approve, lookup: api.lookup } }));
vi.mock('@/features/document-generation/api/document-task-api', () => ({ documentTaskApi: { letterArtifacts: api.artifacts } }));
vi.mock('@/features/document-generation/hooks/use-document-generation', () => ({ useDocumentGeneration: () => generation }));

import { useLetterWorkflow } from './use-letter-workflow';

beforeEach(() => {
  vi.resetAllMocks();
  clearRuntimeCommandsForSession(session.sessionId);
  sessionStorage.clear();
  generation.state.artifacts = null;
  api.resolution.mockResolvedValue({ state: 'resolved', revision: 10 });
  api.selection.mockResolvedValue({ state: 'current', resolutionRevision: 'case-1:resolutionRevision:r10', criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r5' });
  api.evidence.mockResolvedValue({ evidenceRevision: 'case-1:evidenceRevision:r6' });
  api.gate.mockResolvedValue({ affirmed: ['a', 'b', 'c', 'd'] });
  generation.start.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('letter generation prerequisites', () => {
  it.each([
    { state: 'stale', resolutionRevision: 'case-1:resolutionRevision:r4' },
    { state: 'stale', resolutionRevision: 'case-1:resolutionRevision:r10' },
    { state: 'current', resolutionRevision: 'case-1:resolutionRevision:r4' },
  ])('blocks generation for an outdated policy snapshot: %j', async (selection) => {
    api.selection.mockResolvedValue({ ...selection, criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r5' });
    const hook = renderHook(() => useLetterWorkflow('case-1', null, vi.fn()));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('error'));
    expect(hook.result.current.view.message).toContain('Policy panel');
    expect(hook.result.current.view.prerequisites).toBeNull();
    await act(async () => hook.result.current.generate());
    expect(api.generate).not.toHaveBeenCalled();
  });

  it('submits the current authoritative revision after the policy snapshot is refreshed', async () => {
    const generated = vi.fn();
    const hook = renderHook(() => useLetterWorkflow('case-1', null, generated));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('ready'));
    await act(async () => hook.result.current.generate());
    expect(generation.start).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevisions: {
        resolutionRevision: 'case-1:resolutionRevision:r10',
        criteriaSelectionRevision: 'case-1:criteriaSelectionRevision:r5',
        evidenceRevision: 'case-1:evidenceRevision:r6',
      },
    }));
    expect(api.generate).not.toHaveBeenCalled();
    expect(generated).not.toHaveBeenCalled();
  });

  it('retains prior clinical authority for a corrected resubmission but requires a fresh gate for an appeal', async () => {
    api.gate.mockResolvedValue({ affirmed: [] });
    const corrected = renderHook(() => useLetterWorkflow('case-1', null, vi.fn(), 'corrected_resubmission'));
    await waitFor(() => expect(corrected.result.current.view.phase).toBe('ready'));
    expect(corrected.result.current.view.prerequisites?.gateComplete).toBe(true);
    corrected.unmount();

    const appeal = renderHook(() => useLetterWorkflow('case-1', null, vi.fn(), 'clinical_appeal'));
    await waitFor(() => expect(appeal.result.current.view.phase).toBe('ready'));
    expect(appeal.result.current.view.prerequisites?.gateComplete).toBe(false);
  });

  it('navigates only when the task supplies a committed artifact receipt', async () => {
    const generated = vi.fn();
    const hook = renderHook(() => useLetterWorkflow('case-1', null, generated));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('ready'));
    generation.state.artifacts = { letter: { letterId: 'letter-1' } };
    hook.rerender();
    await waitFor(() => expect(generated).toHaveBeenCalledWith('letter-1'));
    hook.rerender();
    expect(generated).toHaveBeenCalledTimes(1);
  });

  it('loads saved assembly separately while clinical status remains the letter projection', async () => {
    const hash = 'a'.repeat(64);
    const letter = { id: 'letter-1', status: 'approved', bodyMarkdown: 'Synthetic saved draft', contentSha256Text: hash };
    const artifacts = { assembly: { canonicalMarkdown: letter.bodyMarkdown, contentSha256: `sha256:${hash}` }, letter: { letterId: 'letter-1', status: 'draft' } };
    api.read.mockResolvedValue(letter);
    api.artifacts.mockResolvedValue(artifacts);
    const hook = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('ready'));
    expect(api.artifacts).toHaveBeenCalledWith('letter-1', 'case-1', 'practice-1');
    expect(hook.result.current.savedArtifacts).toEqual(artifacts);
    expect(hook.result.current.view.letter?.status).toBe('approved');
  });

  it('refuses saved assembly that differs from the authoritative letter body', async () => {
    api.read.mockResolvedValue({ id: 'letter-1', bodyMarkdown: 'Synthetic current body', contentSha256Text: 'a'.repeat(64) });
    api.artifacts.mockResolvedValue({ assembly: { canonicalMarkdown: 'Synthetic other body', contentSha256: `sha256:${'a'.repeat(64)}` } });
    const hook = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('error'));
    expect(hook.result.current.savedArtifacts).toBeNull();
  });

  it('allows the historical letter display only when the host explicitly returns no assembly', async () => {
    api.read.mockResolvedValue({ id: 'letter-1', bodyMarkdown: 'Synthetic legacy draft', contentSha256Text: 'a'.repeat(64) });
    api.artifacts.mockResolvedValue(null);
    const hook = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('ready'));
    expect(hook.result.current.savedArtifacts).toBeNull();
    expect(hook.result.current.view.letter?.id).toBe('letter-1');
  });
  it.each(['review', 'approve'] as const)('retains an uncertain %s identity through retries and remount', async (operation) => {
    api.read.mockResolvedValue({ id: 'letter-1', caseId: 'case-1', version: 2, qaRevision: 4,
      status: operation === 'review' ? 'draft' : 'in_review', bodyMarkdown: 'Synthetic draft', contentSha256Text: 'a'.repeat(64) });
    api.artifacts.mockResolvedValue(null);
    api[operation].mockRejectedValue(new ApiError(502, 'unavailable'));
    api.lookup.mockRejectedValue(new ApiError(502, 'unavailable'));
    const first = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(first.result.current.view.phase).toBe('ready'));
    await act(async () => first.result.current[operation]());
    const original = api[operation].mock.calls[0][2].commandId;
    expect(first.result.current.view.message).toMatch(/not confirmed|uncertain/i);
    first.unmount();
    clearRuntimeCommandsForSession(session.sessionId, 'revalidation');
    const second = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(second.result.current.view.phase).toBe('ready'));
    await act(async () => second.result.current[operation]());
    expect(api[operation]).toHaveBeenCalledTimes(1);
    expect(api.lookup).toHaveBeenLastCalledWith('case-1', original, session.practiceId);
    api.lookup.mockResolvedValue({ commandId: original, caseId: 'case-1', letterId: 'letter-1' });
    await act(async () => second.result.current[operation]());
    expect(api[operation]).toHaveBeenCalledTimes(1);
    expect(second.result.current.view.message).toBeNull();
  });

  it('retries a confirmed-absent clinical command with its original UUID and revision payload', async () => {
    const letter = { id: 'letter-1', caseId: 'case-1', version: 2, qaRevision: 4, status: 'draft', bodyMarkdown: 'Synthetic draft', contentSha256Text: 'a'.repeat(64) };
    api.read.mockResolvedValue(letter);
    api.artifacts.mockResolvedValue(null);
    api.review.mockRejectedValueOnce(new ApiError(502, 'unavailable'));
    api.lookup.mockRejectedValueOnce(new ApiError(502, 'unavailable'));
    const hook = renderHook(() => useLetterWorkflow('case-1', 'letter-1', vi.fn()));
    await waitFor(() => expect(hook.result.current.view.phase).toBe('ready'));
    await act(async () => hook.result.current.review());
    const payload = api.review.mock.calls[0][2];
    api.lookup.mockRejectedValueOnce(new ApiError(404, 'not_found'));
    api.review.mockResolvedValueOnce({ commandId: payload.commandId, caseId: 'case-1', letterId: 'letter-1' });
    await act(async () => hook.result.current.review());
    expect(api.review).toHaveBeenNthCalledWith(2, 'letter-1', session.practiceId, payload);
    expect(hook.result.current.pendingAction).toBeNull();
  });

});
