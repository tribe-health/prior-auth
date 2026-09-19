import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ latest: vi.fn(), record: vi.fn(), confirmMode: vi.fn() }));
vi.mock('@/app/providers/session-provider', () => ({ useRequiredSession: () => ({ practiceId: 'practice-1' }) }));
vi.mock('../api/denial-response-api', () => ({ denialResponseApi: api }));

import { useDenialResponse } from './use-denial-response';

const determination = {
  id: 'determination-1', caseId: 'case-1', outcome: 'denied', decidedOn: '2026-09-19',
  reasonCode: 'medical-necessity', reasonText: 'Synthetic reason', appealDeadline: null,
  documentId: 'document-1', documentName: 'Synthetic determination', responseMode: null,
  createdAt: '2026-09-19T00:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  api.latest.mockResolvedValue(determination);
});
afterEach(cleanup);

describe('denial response classification', () => {
  it.each(['corrected_resubmission', 'clinical_appeal'] as const)('persists the explicit %s choice against the current determination', async (mode) => {
    api.confirmMode.mockResolvedValue({
      commandId: 'command-1', caseId: 'case-1', determinationId: determination.id,
      mode, committedAt: '2026-09-19T01:00:00Z',
    });
    const hook = renderHook(() => useDenialResponse('case-1'));
    await waitFor(() => expect(hook.result.current.determination?.id).toBe(determination.id));
    await act(async () => hook.result.current.confirmMode(mode));
    expect(api.confirmMode).toHaveBeenCalledWith('case-1', 'practice-1', expect.objectContaining({
      expectedDeterminationId: determination.id, mode,
    }));
    expect(hook.result.current.determination?.responseMode).toBe(mode);
  });
});
