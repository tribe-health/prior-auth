export type SubmissionPurpose = 'prior_authorization_request' | 'corrected_resubmission' | 'clinical_appeal';
export interface PacketLetter {
  readonly id: string;
  readonly purpose: SubmissionPurpose;
  readonly status: string;
  readonly version: number;
  readonly revision: number;
  readonly contentSha256Text: string;
  readonly signedAt: string | null;
}
export interface PacketAttachment {
  readonly ordinal: number;
  readonly kind: 'letter' | 'source';
  readonly name: string;
  readonly documentId: string | null;
  readonly pageCount: number;
  readonly contentSha256Text: string;
}
export interface Submission {
  readonly id: string;
  readonly commandId: string;
  readonly letterId: string;
  readonly status: string;
  readonly channel: string;
  readonly attempt: number;
  readonly submittedAt: string;
  readonly totalPages: number;
  readonly manifestSha256Text: string;
}
export interface SubmissionPacket {
  readonly caseId: string;
  readonly letter: PacketLetter | null;
  readonly submission: Submission | null;
  readonly attachments: readonly PacketAttachment[];
  readonly canSubmit: boolean;
  readonly blockReason: string | null;
}
export interface PayerReceipt {
  readonly id: string;
  readonly commandId: string;
  readonly submissionId: string;
  readonly payerReference: string;
  readonly acknowledgedAt: string;
  readonly pageCount: number;
  readonly recordedAt: string;
}
export interface ReceiptView {
  readonly packet: SubmissionPacket;
  readonly receipt: PayerReceipt | null;
  readonly custody: readonly { readonly sequence: number; readonly event: string; readonly occurredAt: string; readonly actorLabel: string }[];
}
export interface SubmitPacketCommand { readonly commandId: string; readonly expectedLetterRevision: number }
export interface AcknowledgePacketCommand {
  readonly commandId: string;
  readonly submissionId: string;
  readonly payerReference: string;
  readonly acknowledgedAt: string;
  readonly pageCount: number;
}
export type PendingSubmissionCommand =
  | { readonly kind: 'submit'; readonly body: SubmitPacketCommand }
  | { readonly kind: 'acknowledge'; readonly body: AcknowledgePacketCommand };
export interface AcknowledgementDraft {
  readonly payerReference: string;
  readonly acknowledgedAt: string;
  readonly pageCount: string;
}
export const EMPTY_ACKNOWLEDGEMENT: AcknowledgementDraft = { payerReference: '', acknowledgedAt: '', pageCount: '' };
export function signedCurrentPacket(packet: SubmissionPacket): boolean {
  return packet.canSubmit && packet.letter?.status === 'signed' && packet.letter.signedAt !== null;
}
export function acknowledgementBody(draft: AcknowledgementDraft, submissionId: string, commandId: string): AcknowledgePacketCommand | null {
  const pageCount = Number(draft.pageCount);
  const date = new Date(draft.acknowledgedAt);
  if (!draft.payerReference.trim() || !draft.pageCount.trim() || !Number.isSafeInteger(pageCount) || pageCount < 0 || !Number.isFinite(date.getTime())) return null;
  return { commandId, submissionId, payerReference: draft.payerReference.trim(), acknowledgedAt: date.toISOString(), pageCount };
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function fields(value: unknown, keys: readonly string[]): value is Record<string, unknown> { return record(value) && keys.every((key) => typeof value[key] === 'string'); }
function integer(value: unknown, minimum = 0): boolean { return Number.isSafeInteger(value) && (value as number) >= minimum; }
export function parsePacket(value: unknown, caseId: string): SubmissionPacket {
  if (!record(value) || value.caseId !== caseId || typeof value.canSubmit !== 'boolean' || !(value.blockReason === null || typeof value.blockReason === 'string') || !Array.isArray(value.attachments)) throw new Error('Invalid submission packet.');
  const letter = value.letter;
  if (letter !== null && (!fields(letter, ['id', 'purpose', 'status', 'contentSha256Text']) || !['prior_authorization_request', 'corrected_resubmission', 'clinical_appeal'].includes(letter.purpose as string) || !integer(letter.version, 1) || !integer(letter.revision, 1) || !(letter.signedAt === null || typeof letter.signedAt === 'string'))) throw new Error('Invalid packet letter.');
  const submission = value.submission;
  if (submission !== null && (!fields(submission, ['id', 'commandId', 'letterId', 'status', 'channel', 'submittedAt', 'manifestSha256Text']) || !integer(submission.attempt, 1) || !integer(submission.totalPages, 1))) throw new Error('Invalid packet transmission.');
  if (!value.attachments.every((item) => fields(item, ['kind', 'name', 'contentSha256Text']) && ['letter', 'source'].includes(item.kind as string) && integer(item.ordinal, 1) && integer(item.pageCount, 1) && (item.documentId === null || typeof item.documentId === 'string'))) throw new Error('Invalid attachment manifest.');
  return value as unknown as SubmissionPacket;
}
export function parseReceiptView(value: unknown, caseId: string): ReceiptView {
  if (!record(value) || !Array.isArray(value.custody)) throw new Error('Invalid receipt view.');
  const packet = parsePacket(value.packet, caseId);
  const receipt = value.receipt;
  if (receipt !== null && (!fields(receipt, ['id', 'commandId', 'submissionId', 'payerReference', 'acknowledgedAt', 'recordedAt']) || !integer(receipt.pageCount) || receipt.submissionId !== packet.submission?.id)) throw new Error('Receipt does not match this submission.');
  if (!value.custody.every((item) => fields(item, ['event', 'occurredAt', 'actorLabel']) && integer(item.sequence, 1))) throw new Error('Invalid custody record.');
  return { packet, receipt: receipt as PayerReceipt | null, custody: value.custody as ReceiptView['custody'] };
}
