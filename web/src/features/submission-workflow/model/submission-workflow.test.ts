import { describe, expect, it } from 'vitest';
import { acknowledgedView, signedPacket } from './submission-workflow.test-fixtures';
import { acknowledgementBody, parsePacket, parseReceiptView } from './submission-workflow';

describe('submission response and acknowledgement contracts', () => {
  it('refuses another case packet and a receipt for another submission', () => {
    expect(() => parsePacket(signedPacket, 'other-case')).toThrow();
    expect(() => parseReceiptView({ ...acknowledgedView, receipt: { ...acknowledgedView.receipt!, submissionId: 'other-submission' } }, 'case-1')).toThrow();
  });
  it.each(['', '-1', '1.5', 'not-a-number'])('refuses invalid acknowledged page count %s', (pageCount) => {
    expect(acknowledgementBody({ payerReference: 'SYNTHETIC', acknowledgedAt: '2026-09-19T10:30', pageCount }, 'submission-1', 'command-1')).toBeNull();
  });
  it('accepts zero acknowledged pages without inventing complete receipt', () => {
    expect(acknowledgementBody({ payerReference: ' SYNTHETIC ', acknowledgedAt: '2026-09-19T10:30', pageCount: '0' }, 'submission-1', 'command-1')).toEqual({ commandId: 'command-1', submissionId: 'submission-1', payerReference: 'SYNTHETIC', acknowledgedAt: new Date('2026-09-19T10:30').toISOString(), pageCount: 0 });
  });
});
