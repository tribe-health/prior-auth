import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { clearRuntimeCommandsForSession } from '@/shared/runtime-command-registry';
import { acknowledgedView, sentPacket, sentView, signedPacket } from '../model/submission-workflow.test-fixtures';

const api = vi.hoisted(() => ({ packet: vi.fn(), receipt: vi.fn(), submit: vi.fn(), acknowledge: vi.fn() }));
const session = vi.hoisted(() => ({ identityId: 'identity-1', sessionId: 'session-1', practiceId: 'practice-1', authorizationRevision: 'r1' }));
const access = vi.hoisted(() => ({ submit: true }));
vi.mock('@/app/providers/session-provider', () => ({ useRequiredSession: () => session, useSessionEpoch: () => 0, useCan: () => access.submit }));
vi.mock('../api/submission-workflow-api', () => ({ submissionWorkflowApi: api }));
import { Component as PacketRoute } from '@/app/routes/submission-packet-route';
import { Component as ReceiptRoute } from '@/app/routes/receipt-verification-route';
import { useSubmissionWorkflow } from '../hooks/use-submission-workflow';

function packetRoute() { return <MemoryRouter initialEntries={['/cases/case-1/packet']}><Routes><Route path="/cases/:caseId/packet" element={<PacketRoute />} /></Routes></MemoryRouter>; }
function receiptRoute() { return <MemoryRouter initialEntries={['/cases/case-1/receipt']}><Routes><Route path="/cases/:caseId/receipt" element={<ReceiptRoute />} /></Routes></MemoryRouter>; }
beforeEach(() => {
  vi.resetAllMocks(); access.submit = true;
  api.packet.mockResolvedValue(signedPacket); api.receipt.mockResolvedValue(sentView);
  api.submit.mockImplementation(async (_caseId, _practiceId, command) => ({ ...sentPacket, submission: { ...sentPacket.submission!, commandId: command.commandId } }));
  api.acknowledge.mockImplementation(async (_caseId, _practiceId, command) => ({ ...acknowledgedView, receipt: { ...acknowledgedView.receipt!, commandId: command.commandId } }));
});
afterEach(() => { cleanup(); clearRuntimeCommandsForSession(session.sessionId); });

describe('mounted submission workflow', () => {
  it('submits the signed current letter revision, never its version', async () => {
    render(packetRoute());
    const button = await screen.findByRole('button', { name: 'Submit signed packet' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('case-1', 'practice-1', expect.objectContaining({ expectedLetterRevision: 12 })));
    expect(api.submit.mock.calls[0]?.[2].commandId).toEqual(expect.any(String));
    expect(screen.queryByRole('button', { name: /download|pdf/i })).toBeNull();
  });
  it.each(['draft', 'approved'])('blocks an unsigned %s letter even if canSubmit is true', async (status) => {
    api.packet.mockResolvedValue({ ...signedPacket, letter: { ...signedPacket.letter!, status, signedAt: null } });
    render(packetRoute());
    const button = await screen.findByRole('button', { name: 'Submit signed packet' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('honors read-only access and a host refusal for a signed letter', async () => {
    access.submit = false;
    api.packet.mockResolvedValue({ ...signedPacket, canSubmit: false, blockReason: 'stale_letter' });
    render(packetRoute());
    expect((await screen.findByRole('button', { name: 'Submit signed packet' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps sent distinct from acknowledged and preserves fields across a resize rerender', async () => {
    const view = render(receiptRoute());
    expect(await screen.findByText('Sent', { exact: true })).toBeTruthy();
    expect(screen.getByText('Not acknowledged', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Acknowledged', { exact: true })).toBeNull();
    const reference = screen.getByLabelText('Payer reference');
    fireEvent.change(reference, { target: { value: 'SYNTHETIC-ACK' } });
    fireEvent.change(screen.getByLabelText('Acknowledged at'), { target: { value: '2026-09-19T10:30' } });
    expect((screen.getByLabelText('Acknowledged pages') as HTMLInputElement).value).toBe('6');
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true });
    fireEvent(window, new Event('resize'));
    view.rerender(receiptRoute());
    expect((screen.getByLabelText('Payer reference') as HTMLInputElement).value).toBe('SYNTHETIC-ACK');
    fireEvent.click(screen.getByRole('button', { name: 'Record acknowledgement' }));
    await waitFor(() => expect(api.acknowledge).toHaveBeenCalledWith('case-1', 'practice-1', expect.objectContaining({ submissionId: 'submission-1', payerReference: 'SYNTHETIC-ACK', pageCount: 6 })));
  });
  it.each([0, 4])('shows a disputed partial acknowledgement for %i pages', async (pageCount) => {
    api.receipt.mockResolvedValue({ ...acknowledgedView, packet: { ...acknowledgedView.packet, submission: { ...acknowledgedView.packet.submission!, status: 'disputed' } }, receipt: { ...acknowledgedView.receipt!, pageCount } });
    render(receiptRoute());
    expect(await screen.findByText('Partial acknowledgement · disputed', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Acknowledged in full', { exact: true })).toBeNull();
    expect(screen.getByText('Page counts differ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record acknowledgement' })).toBeNull();
  });
  it('shows full acknowledgement only for the persisted acknowledged state and complete receipt', async () => {
    api.receipt.mockResolvedValue(acknowledgedView);
    render(receiptRoute());
    expect(await screen.findByText('Acknowledged in full', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Partial acknowledgement · disputed', { exact: true })).toBeNull();
  });
  it('makes a failed read actionable without enabling submission', async () => {
    api.packet.mockRejectedValueOnce(new Error('unavailable'));
    render(packetRoute());
    const reload = await screen.findByRole('button', { name: 'Reload submission record' });
    reload.focus(); expect(document.activeElement).toBe(reload);
    expect(screen.queryByRole('button', { name: 'Submit signed packet' })).toBeNull();
    fireEvent.click(reload);
    expect(await screen.findByRole('button', { name: 'Submit signed packet' })).toBeTruthy();
  });
  it('does not attach acknowledgement fields from an older submission to a newer one', async () => {
    const hook = renderHook(() => useSubmissionWorkflow('case-1', 'receipt'));
    await waitFor(() => expect(hook.result.current.phase).toBe('ready'));
    act(() => hook.result.current.updateDraft({ payerReference: 'SYNTHETIC-OLD-REFERENCE' }));
    api.receipt.mockResolvedValue({ ...sentView, packet: { ...sentPacket, submission: { ...sentPacket.submission!, id: 'submission-2', totalPages: 8 } } });
    await act(async () => hook.result.current.reload());
    expect(hook.result.current.draft).toEqual({ payerReference: '', acknowledgedAt: '', pageCount: '8' });
  });
});
