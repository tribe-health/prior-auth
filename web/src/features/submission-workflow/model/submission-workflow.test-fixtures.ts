import type { ReceiptView, SubmissionPacket } from './submission-workflow';

export const signedPacket: SubmissionPacket = {
  caseId: 'case-1', letter: { id: 'letter-1', purpose: 'prior_authorization_request', status: 'signed', version: 3, revision: 12, contentSha256Text: 'a'.repeat(64), signedAt: '2026-09-19T12:00:00Z' }, submission: null,
  attachments: [{ ordinal: 1, kind: 'letter', name: 'Synthetic signed request', documentId: null, pageCount: 2, contentSha256Text: 'a'.repeat(64) }, { ordinal: 2, kind: 'source', name: 'Synthetic source document with a long descriptive title', documentId: 'document-1', pageCount: 4, contentSha256Text: 'b'.repeat(64) }], canSubmit: true, blockReason: null,
};
export const sentPacket: SubmissionPacket = { ...signedPacket, canSubmit: false, blockReason: 'already_submitted', submission: { id: 'submission-1', commandId: 'submit-command-1', letterId: 'letter-1', status: 'sent', channel: 'portal', attempt: 1, submittedAt: '2026-09-19T13:00:00Z', totalPages: 6, manifestSha256Text: 'c'.repeat(64) } };
export const sentView: ReceiptView = { packet: sentPacket, receipt: null, custody: [{ sequence: 1, event: 'submitted', occurredAt: '2026-09-19T13:00:00Z', actorLabel: 'Synthetic coordinator' }] };
export const acknowledgedView: ReceiptView = { ...sentView, packet: { ...sentPacket, submission: { ...sentPacket.submission!, status: 'acknowledged' } }, receipt: { id: 'receipt-1', commandId: 'ack-command-1', submissionId: 'submission-1', payerReference: 'SYNTHETIC-REFERENCE', acknowledgedAt: '2026-09-19T14:00:00Z', pageCount: 6, recordedAt: '2026-09-19T14:05:00Z' } };
