/** Presentation contracts from clinical-docs and aso-document-assembly.
 * Descriptors are untrusted; clinical authority and committed state come only
 * from the host. This module owns no storage or network operations.
 */
export const DOCUMENT_SURFACE_SCHEMAS = {
  DraftPreviewBlock: 'aso.draft_preview.v1',
  QaFindingsBlock: 'aso.qa_findings.v1',
  ClaimsManifestBlock: 'aso.claims_manifest.v1',
  HaltMemoBlock: 'aso.halt_memo.v1',
} as const;

export const QA_SEVERITY = {
  unsupported_claim: 'blocking',
  annotation_attribution: 'blocking',
  criterion_coverage: 'blocking',
  policy_version_currency: 'blocking',
  code_consistency: 'warning',
  date_consistency: 'warning',
  readability: 'advisory',
} as const;

export type QaCheck = keyof typeof QA_SEVERITY;
export type QaFinding = {
  readonly check: QaCheck;
  readonly severity: 'blocking' | 'warning' | 'advisory';
  readonly outcome: 'pass' | 'fail' | 'not_applicable';
  readonly detail: string;
  readonly data?: unknown;
};

export type DocumentSource = {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly title: string;
  readonly page: number;
  readonly effectiveDate: string;
  readonly contentSha256: string;
  readonly sourceQuote: string;
};

type Attribution = {
  readonly annotationId: string;
  readonly author: string;
  readonly authoredOn: string;
};

export type ClaimProvenance =
  | ({ readonly kind: 'document' } & DocumentSource)
  | ({ readonly kind: 'attributed_document' } & DocumentSource & Attribution)
  | ({ readonly kind: 'annotation' } & Attribution);

export type RenderedClaim = {
  readonly ordinal: number;
  readonly text: string;
  readonly provenance: ClaimProvenance;
  readonly criterionId: string | null;
};

const DOCUMENT_CLASSES = [
  'clinical_correspondence', 'procedural_correspondence', 'internal_work_product',
  'patient_facing', 'structured_transaction', 'source_documentation_assist',
] as const;

export type DraftPreviewProps = {
  readonly kindKey: string;
  readonly kindVersion: number;
  readonly class: typeof DOCUMENT_CLASSES[number];
  readonly contentSha256: string;
  readonly templateDigest: string;
  readonly canonicalMarkdown: string;
  readonly approvable: boolean;
};
export type QaFindingsProps = { readonly findings: readonly QaFinding[] };
export type ClaimsManifestProps = { readonly claims: readonly RenderedClaim[] };
export type EvidenceRouting =
  | { readonly criterion: string; readonly state: 'gap'; readonly routesTo: 'clinician' }
  | { readonly criterion: string; readonly state: 'void'; readonly routesTo: 'coordinator' };
export type HaltMemoProps = {
  readonly blocking: readonly QaFinding[];
  readonly routing: readonly EvidenceRouting[];
};

type Surface<Name extends keyof typeof DOCUMENT_SURFACE_SCHEMAS, Props, Slot extends 'main' | 'side'> = {
  readonly surface: Name;
  readonly schema: typeof DOCUMENT_SURFACE_SCHEMAS[Name];
  readonly slot: Slot;
  readonly props: Props;
};
export type DocumentSurface =
  | Surface<'DraftPreviewBlock', DraftPreviewProps, 'main'>
  | Surface<'QaFindingsBlock', QaFindingsProps, 'side'>
  | Surface<'ClaimsManifestBlock', ClaimsManifestProps, 'side'>
  | Surface<'HaltMemoBlock', HaltMemoProps, 'main'>;

export type DocumentAssembly = {
  readonly kindKey: string;
  readonly kindVersion: number;
  readonly templatePackage: string;
  readonly templateDigest: string;
  readonly canonicalMarkdown: string;
  readonly renderedClaims: readonly RenderedClaim[];
  readonly qa: readonly QaFinding[];
  readonly contentSha256: string;
};

/** A trusted host prop, never accepted inside a composer descriptor. */
export type DocumentPresentationState =
  | { readonly status: 'provisional' }
  | { readonly status: 'committed'; readonly documentId: string; readonly revision: string; readonly contentSha256: string };

export type SurfaceParseResult =
  | { readonly status: 'accepted'; readonly descriptor: DocumentSurface }
  | { readonly status: 'refused'; readonly reason: 'privileged_surface' | 'unknown_surface' | 'unknown_schema' | 'malformed_descriptor'; readonly message: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return record(value) && required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function unsigned(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 4_294_967_295;
}

function hash(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

function qaFinding(value: unknown): value is QaFinding {
  if (!shape(value, ['check', 'severity', 'outcome', 'detail'], ['data'])
      || typeof value.check !== 'string' || !Object.hasOwn(QA_SEVERITY, value.check)) return false;
  return value.severity === QA_SEVERITY[value.check as QaCheck]
    && typeof value.outcome === 'string' && ['pass', 'fail', 'not_applicable'].includes(value.outcome)
    && typeof value.detail === 'string';
}

const DOCUMENT_FIELDS = ['documentId', 'documentVersion', 'title', 'page', 'effectiveDate', 'contentSha256', 'sourceQuote'];
const ATTRIBUTION_FIELDS = ['annotationId', 'author', 'authoredOn'];

function provenance(value: unknown): value is ClaimProvenance {
  if (!record(value)) return false;
  const attributed = value.kind === 'attributed_document' || value.kind === 'annotation';
  const backed = value.kind === 'document' || value.kind === 'attributed_document';
  if ((!backed && !attributed) || !shape(value, [
    'kind', ...(backed ? DOCUMENT_FIELDS : []), ...(attributed ? ATTRIBUTION_FIELDS : []),
  ])) return false;
  if (attributed && !ATTRIBUTION_FIELDS.every((key) => text(value[key]))) return false;
  return !backed || (text(value.documentId) && unsigned(value.documentVersion, 1)
    && text(value.title) && unsigned(value.page, 1) && text(value.effectiveDate)
    && text(value.contentSha256) && typeof value.sourceQuote === 'string');
}

function renderedClaim(value: unknown): value is RenderedClaim {
  return shape(value, ['ordinal', 'text', 'provenance', 'criterionId'])
    && unsigned(value.ordinal) && text(value.text) && provenance(value.provenance)
    && (value.criterionId === null || text(value.criterionId));
}

function claims(value: unknown): value is readonly RenderedClaim[] {
  return Array.isArray(value) && value.every(renderedClaim)
    && new Set(value.map((claim) => claim.ordinal)).size === value.length;
}

export function isBlockingQaFailure(finding: QaFinding): boolean {
  return finding.severity === 'blocking' && finding.outcome === 'fail';
}

function routing(value: unknown): value is EvidenceRouting {
  return shape(value, ['criterion', 'state', 'routesTo']) && text(value.criterion)
    && ((value.state === 'gap' && value.routesTo === 'clinician')
      || (value.state === 'void' && value.routesTo === 'coordinator'));
}

function validProps(surface: string, value: unknown): boolean {
  switch (surface) {
    case 'DraftPreviewBlock':
      return shape(value, ['kindKey', 'kindVersion', 'class', 'contentSha256', 'templateDigest', 'canonicalMarkdown', 'approvable'])
        && text(value.kindKey) && unsigned(value.kindVersion, 1)
        && DOCUMENT_CLASSES.some((kind) => kind === value.class)
        && hash(value.contentSha256) && hash(value.templateDigest)
        && typeof value.canonicalMarkdown === 'string' && typeof value.approvable === 'boolean';
    case 'QaFindingsBlock':
      return shape(value, ['findings']) && Array.isArray(value.findings) && value.findings.every(qaFinding);
    case 'ClaimsManifestBlock':
      return shape(value, ['claims']) && claims(value.claims);
    case 'HaltMemoBlock':
      return shape(value, ['blocking', 'routing']) && Array.isArray(value.blocking)
        && value.blocking.length > 0 && value.blocking.every((finding) => qaFinding(finding) && isBlockingQaFailure(finding))
        && Array.isArray(value.routing) && value.routing.every(routing);
    default:
      return false;
  }
}

/** Exact v1 allowlist. Unknown keys cannot smuggle actions or commit state. */
export function parseDocumentSurface(value: unknown): SurfaceParseResult {
  if (record(value) && ['AffirmationBlock', 'SigningBlock', 'SubmissionBlock'].includes(String(value.surface))) {
    return { status: 'refused', reason: 'privileged_surface', message: 'This generated block requests a protected clinical action. It cannot be shown.' };
  }
  if (!shape(value, ['surface', 'schema', 'slot', 'props']) || typeof value.surface !== 'string') {
    return { status: 'refused', reason: 'malformed_descriptor', message: 'This generated block has invalid fields. Request a new result.' };
  }
  if (!Object.hasOwn(DOCUMENT_SURFACE_SCHEMAS, value.surface)) {
    return { status: 'refused', reason: 'unknown_surface', message: 'This generated block is not supported by the workbench.' };
  }
  const surface = value.surface as keyof typeof DOCUMENT_SURFACE_SCHEMAS;
  if (value.schema !== DOCUMENT_SURFACE_SCHEMAS[surface]) {
    return { status: 'refused', reason: 'unknown_schema', message: 'This generated block uses an unsupported version. Request a compatible result.' };
  }
  const expectedSlot = surface === 'DraftPreviewBlock' || surface === 'HaltMemoBlock' ? 'main' : 'side';
  if (value.slot !== expectedSlot || !validProps(surface, value.props)) {
    return { status: 'refused', reason: 'malformed_descriptor', message: 'This generated block has invalid fields. Request a new result.' };
  }
  return { status: 'accepted', descriptor: value as DocumentSurface };
}

export function parseDocumentAssembly(value: unknown): DocumentAssembly | null {
  return shape(value, ['kindKey', 'kindVersion', 'templatePackage', 'templateDigest', 'canonicalMarkdown', 'renderedClaims', 'qa', 'contentSha256'])
    && text(value.kindKey) && unsigned(value.kindVersion, 1) && text(value.templatePackage)
    && hash(value.templateDigest) && hash(value.contentSha256) && typeof value.canonicalMarkdown === 'string'
    && claims(value.renderedClaims) && Array.isArray(value.qa) && value.qa.every(qaFinding)
    ? value as DocumentAssembly : null;
}
