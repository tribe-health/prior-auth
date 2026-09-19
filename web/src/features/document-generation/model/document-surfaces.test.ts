import { describe, expect, it } from 'vitest';

import { parseDocumentAssembly, parseDocumentSurface } from './document-surfaces';

const digest = `sha256:${'a'.repeat(64)}`;
const finding = { check: 'criterion_coverage', severity: 'blocking', outcome: 'fail', detail: 'Synthetic criterion C2 has no source.' };
const claim = {
  ordinal: 1, text: 'Synthetic chart statement.', criterionId: 'C1',
  provenance: {
    kind: 'document', documentId: 'synthetic-document', documentVersion: 2,
    title: 'Synthetic chart', page: 3, effectiveDate: '2026-09-19',
    contentSha256: 'sha256:1111', sourceQuote: 'Synthetic quoted evidence.',
  },
};
const draft = {
  surface: 'DraftPreviewBlock', schema: 'aso.draft_preview.v1', slot: 'main',
  props: { kindKey: 'pa.initial_request', kindVersion: 1, class: 'clinical_correspondence',
    contentSha256: digest, templateDigest: digest, canonicalMarkdown: '# Synthetic draft', approvable: false },
};
const qa = { surface: 'QaFindingsBlock', schema: 'aso.qa_findings.v1', slot: 'side', props: { findings: [finding] } };
const manifest = { surface: 'ClaimsManifestBlock', schema: 'aso.claims_manifest.v1', slot: 'side', props: { claims: [claim] } };
const halt = { surface: 'HaltMemoBlock', schema: 'aso.halt_memo.v1', slot: 'main', props: {
  blocking: [finding], routing: [
    { criterion: 'C2', state: 'gap', routesTo: 'clinician' },
    { criterion: 'C3', state: 'void', routesTo: 'coordinator' },
  ],
} };

describe('versioned document surface boundary', () => {
  it.each([draft, qa, manifest, halt])('accepts the service $surface v1 descriptor', (descriptor) => {
    expect(parseDocumentSurface(descriptor)).toEqual({ status: 'accepted', descriptor });
  });

  it.each(['AffirmationBlock', 'SigningBlock', 'SubmissionBlock'])('refuses privileged %s', (surface) => {
    expect(parseDocumentSurface({ ...draft, surface })).toMatchObject({ status: 'refused', reason: 'privileged_surface' });
  });

  it('refuses unknown component names without interpreting their descriptions', () => {
    expect(parseDocumentSurface({ ...draft, surface: 'SafeSigningPreview' })).toMatchObject({ status: 'refused', reason: 'unknown_surface' });
  });

  it.each(['aso.draft_preview.v2', 'aso.qa_findings.v1', ''])('refuses incompatible schema %s', (schema) => {
    expect(parseDocumentSurface({ ...draft, schema })).toMatchObject({ status: 'refused', reason: 'unknown_schema' });
  });

  it.each([
    null, [], {}, { ...draft, slot: 'signing' },
    { ...draft, committed: true },
    { ...draft, props: { ...draft.props, signed: true } },
    { ...draft, props: { ...draft.props, actions: [{ name: 'sign_letter' }] } },
    { ...draft, props: { ...draft.props, kindVersion: -1 } },
    { ...draft, props: { ...draft.props, contentSha256: 'not-a-content-hash' } },
    { ...qa, props: { findings: [null] } },
    { ...qa, props: { findings: [{ ...finding, outcome: ['fail'] }] } },
  ])('refuses malformed descriptors and injected authority', (descriptor) => {
    expect(parseDocumentSurface(descriptor).status).toBe('refused');
  });

  it('refuses severity downgrade of a mandatory blocking check', () => {
    expect(parseDocumentSurface({ ...qa, props: { findings: [{ ...finding, severity: 'advisory' }] } })).toMatchObject({ status: 'refused' });
  });

  it('refuses a halt memo that misroutes a void to a clinician', () => {
    expect(parseDocumentSurface({ ...halt, props: { ...halt.props, routing: [{ criterion: 'C3', state: 'void', routesTo: 'clinician' }] } })).toMatchObject({ status: 'refused' });
  });

  it('refuses a nonblocking finding presented as the reason to halt', () => {
    expect(parseDocumentSurface({ ...halt, props: { ...halt.props, blocking: [{ ...finding, outcome: 'pass' }] } })).toMatchObject({ status: 'refused' });
  });

  it.each([{ page: 0 }, { effectiveDate: '' }, { documentVersion: 0 }, { annotationId: 'unattributed-opinion' }])('refuses incomplete or ambiguous document provenance', (override) => {
    expect(parseDocumentSurface({ ...manifest, props: { claims: [{ ...claim, provenance: { ...claim.provenance, ...override } }] } })).toMatchObject({ status: 'refused' });
  });

  it('refuses duplicate claim identity', () => {
    expect(parseDocumentSurface({ ...manifest, props: { claims: [claim, claim] } })).toMatchObject({ status: 'refused' });
  });

  it('preserves annotation-only internal work without inventing a document', () => {
    const descriptor = { ...manifest, props: { claims: [{ ...claim, provenance: { kind: 'annotation', annotationId: 'synthetic-note', author: 'Synthetic clinician', authoredOn: '2026-09-19' } }] } };
    expect(parseDocumentSurface(descriptor)).toEqual({ status: 'accepted', descriptor });
  });

  it('parses the engine assembly independently from UI descriptors', () => {
    const assembly = { kindKey: draft.props.kindKey, kindVersion: 1, templatePackage: 'aso-prior-auth',
      templateDigest: digest, canonicalMarkdown: '# Synthetic draft', renderedClaims: [claim], qa: [finding], contentSha256: digest };
    expect(parseDocumentAssembly(assembly)).toEqual(assembly);
    expect(parseDocumentAssembly({ ...assembly, signed: true })).toBeNull();
  });
});
