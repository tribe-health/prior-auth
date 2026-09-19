import { afterEach, describe, expect, it, vi } from 'vitest';

import { invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core';
import { annotationApi } from '@/features/annotations/api/annotation-api';
import { timelineApi } from '@/features/evidence-timeline/api/timeline-api';
import { signingApi } from '@/features/letter-signing/api/signing-api';
import { gateApi } from '@/features/surgeon-gate/api/gate-api';
import { invokeNative, isNativeRuntime } from '@/shared/native-command-client';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedIsTauri = vi.mocked(tauriIsTauri);

afterEach(() => {
  mockedInvoke.mockReset();
  mockedIsTauri.mockReset();
  mockedIsTauri.mockReturnValue(false);
});

describe('native command composition adapter', () => {
  it('uses the Tauri 2 injected runtime detector', () => {
    expect(isNativeRuntime()).toBe(false);
    mockedIsTauri.mockReturnValue(true);
    expect(isNativeRuntime()).toBe(true);
  });

  it('routes the complete clinical inventory through closed epoch-scoped IPC inputs', async () => {
    mockedIsTauri.mockReturnValue(true);
    mockedInvoke.mockResolvedValue({});
    const epoch = 7;
    const practiceId = '00000000-0000-4000-8000-000000000001';
    const caseId = '00000000-0000-4000-8000-000000000002';
    const resourceId = '00000000-0000-4000-8000-000000000003';
    const commandId = '00000000-0000-4000-8000-000000000004';

    await gateApi.read(caseId, practiceId, epoch);
    await gateApi.affirm(caseId, { commandId, kind: 'policy' }, practiceId, epoch);
    await gateApi.remove(caseId, { commandId, kind: 'policy' }, practiceId, epoch);
    await gateApi.lookupCommand(caseId, commandId, practiceId, epoch);
    await signingApi.readTarget(resourceId, practiceId, epoch);
    await signingApi.sign(resourceId, commandId, {
      letterId: resourceId,
      caseId,
      letterVersion: 2,
      qaRevision: 3,
      signatureVersion: 1,
      status: 'approved',
      approvedByActor: true,
      isCurrent: true,
      gateAffirmed: true,
      qaComplete: true,
      sourcesComplete: true,
    }, practiceId, epoch);
    await signingApi.lookup(resourceId, commandId, practiceId, epoch);
    await timelineApi.reassess(
      caseId,
      resourceId,
      commandId,
      'gap',
      '2026-09-16T12:00:00Z',
      practiceId,
      epoch,
    );
    await timelineApi.lookupCommand(caseId, resourceId, commandId, practiceId, epoch);
    await annotationApi.save(caseId, resourceId, practiceId, {
      commandId,
      annotationId: resourceId,
      annotationTypeId: '00000000-0000-4000-8000-000000000005',
      name: 'Clinical judgment',
      data: { assertion: 'Synthetic opinion.' },
      body: 'Synthetic opinion.',
      targetEvidenceId: resourceId,
      targetDocumentId: null,
      disposition: 'held',
      expectedRevision: 0,
    }, epoch);
    await annotationApi.lookupCommand(caseId, resourceId, commandId, practiceId, epoch);

    expect(mockedInvoke.mock.calls.map(([command]) => command)).toEqual([
      'gate_state',
      'affirm_gate',
      'remove_gate',
      'lookup_gate_command',
      'signing_target',
      'sign_letter',
      'lookup_sign_letter_command',
      'reassess_evidence',
      'lookup_reassessment_command',
      'save_annotation',
      'lookup_annotation_command',
    ]);
    for (const [, args] of mockedInvoke.mock.calls) {
      expect(args).toMatchObject({ input: { epoch } });
      expect(JSON.stringify(args)).not.toMatch(/token|actor|identity|principal|capabilit/i);
    }
  });

  it('preserves typed IPC denial and availability outcomes', async () => {
    mockedInvoke.mockRejectedValueOnce({ status: 403, code: 'native_epoch_stale' });
    await expect(invokeNative('gate_state', { epoch: 1 }))
      .rejects.toEqual(expect.objectContaining({
        status: 403,
        code: 'native_epoch_stale',
      }));

    mockedInvoke.mockRejectedValueOnce('transport lost');
    await expect(invokeNative('gate_state', { epoch: 1 }))
      .rejects.toEqual(expect.objectContaining({
        status: 503,
        code: 'native_ipc_unavailable',
      }));
  });
});
