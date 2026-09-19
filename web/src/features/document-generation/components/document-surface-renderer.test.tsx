import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurfaceRenderer } from './document-surface-renderer';

afterEach(cleanup);

const digest = `sha256:${'a'.repeat(64)}`;
const finding = { check: 'criterion_coverage', severity: 'blocking', outcome: 'fail', detail: 'Synthetic criterion C2 has no source.' };
const source = { kind: 'document', documentId: 'synthetic-document', documentVersion: 2,
  title: 'Synthetic chart', page: 3, effectiveDate: '2026-09-19', contentSha256: 'sha256:1111', sourceQuote: 'Synthetic quoted evidence.' };
const draft = { surface: 'DraftPreviewBlock', schema: 'aso.draft_preview.v1', slot: 'main', props: {
  kindKey: 'pa.initial_request', kindVersion: 1, class: 'clinical_correspondence', contentSha256: digest,
  templateDigest: digest, canonicalMarkdown: '# Synthetic draft\n\nA source-backed statement.', approvable: false,
} };

describe('document surface renderer', () => {
  it.each([
    { ...draft, surface: 'SigningBlock' },
    { ...draft, schema: 'aso.draft_preview.v9000' },
    { ...draft, props: { ...draft.props, canonicalMarkdown: null } },
    { ...draft, surface: 'NotRegistered' },
  ])('visibly refuses untrusted descriptors without exposing clinical controls', (descriptor) => {
    render(<DocumentSurfaceRenderer descriptor={descriptor} />);
    expect(screen.getByRole('alert').textContent).toContain('Generated block unavailable');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Draft preview' })).toBeNull();
  });

  it('shows provisional and unsigned status even when the engine calls the draft approvable', () => {
    render(<DocumentSurfaceRenderer descriptor={{ ...draft, props: { ...draft.props, approvable: true } }} />);
    expect(screen.getByText('Provisional · Not saved')).toBeTruthy();
    expect(screen.getByText(/Unsigned document/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sign|affirm|approve|submit/i })).toBeNull();
  });

  it('marks a draft saved only from host metadata for that exact content hash', () => {
    const committed = { status: 'committed' as const, documentId: 'host-document', revision: 'revision-4', contentSha256: digest };
    const { rerender } = render(<DocumentSurfaceRenderer descriptor={draft} presentation={committed} />);
    expect(screen.getByText('Saved to case')).toBeTruthy();
    expect(screen.getByText('Revision revision-4')).toBeTruthy();
    rerender(<DocumentSurfaceRenderer descriptor={draft} presentation={{ ...committed, contentSha256: `sha256:${'b'.repeat(64)}` }} />);
    expect(screen.getByText('Provisional · Not saved')).toBeTruthy();
    expect(screen.queryByText('Saved to case')).toBeNull();
  });

  it('keeps blocking QA failures visible with severity and outcome', () => {
    render(<DocumentSurfaceRenderer descriptor={{ surface: 'QaFindingsBlock', schema: 'aso.qa_findings.v1', slot: 'side', props: { findings: [
      { check: 'readability', severity: 'advisory', outcome: 'pass', detail: 'Synthetic readability result.' }, finding,
    ] } }} />);
    expect(screen.getByRole('alert').textContent).toContain('1 blocking failure');
    expect(screen.getByText('Blocking · Fail')).toBeTruthy();
    expect(screen.getByText(finding.detail)).toBeTruthy();
    expect(screen.getByText('Advisory · Pass')).toBeTruthy();
  });

  it('refuses forged QA severity instead of hiding the blocking failure', () => {
    render(<DocumentSurfaceRenderer descriptor={{ surface: 'QaFindingsBlock', schema: 'aso.qa_findings.v1', slot: 'side', props: { findings: [{ ...finding, severity: 'advisory' }] } }} />);
    expect(screen.getByRole('alert').textContent).toContain('Generated block unavailable');
    expect(screen.queryByText('Advisory · Fail')).toBeNull();
  });

  it('keeps gap and void work routed to distinct roles in the halt memo', () => {
    render(<DocumentSurfaceRenderer descriptor={{ surface: 'HaltMemoBlock', schema: 'aso.halt_memo.v1', slot: 'main', props: {
      blocking: [finding], routing: [
        { criterion: 'C2', state: 'gap', routesTo: 'clinician' },
        { criterion: 'C3', state: 'void', routesTo: 'coordinator' },
      ],
    } }} />);
    expect(screen.getByRole('alert').textContent).toContain('Document halted');
    expect(screen.getByText('Gap')).toBeTruthy();
    expect(screen.getByText('Void')).toBeTruthy();
    expect(screen.getByText('Clinician: argue the documented gap.')).toBeTruthy();
    expect(screen.getByText('Coordinator: obtain the missing evidence.')).toBeTruthy();
  });

  it('opens immutable document provenance only through the supplied callback', () => {
    const onOpenSource = vi.fn();
    render(<DocumentSurfaceRenderer onOpenSource={onOpenSource} descriptor={{ surface: 'ClaimsManifestBlock', schema: 'aso.claims_manifest.v1', slot: 'side', props: { claims: [
      { ordinal: 1, text: 'Synthetic claim.', criterionId: 'C1', provenance: source },
    ] } }} />);
    const button = screen.getByRole('button', { name: 'Open source for claim 1: Synthetic chart, page 3' });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onOpenSource).toHaveBeenCalledExactlyOnceWith(source, button);
    expect(screen.getByText(/page 3 · 2026-09-19 · version 2/)).toBeTruthy();
    expect(screen.getByText('“Synthetic quoted evidence.”')).toBeTruthy();
  });

  it('labels annotation-only content internal and offers no document source action', () => {
    render(<DocumentSurfaceRenderer descriptor={{ surface: 'ClaimsManifestBlock', schema: 'aso.claims_manifest.v1', slot: 'side', props: { claims: [
      { ordinal: 2, text: 'Synthetic opinion.', criterionId: null, provenance: { kind: 'annotation', annotationId: 'synthetic-opinion', author: 'Synthetic clinician', authoredOn: '2026-09-19' } },
    ] } }} />);
    expect(screen.getByRole('alert').textContent).toContain('This assertion has no source document. It will not be included in external correspondence.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not give generated markdown remote media or navigation authority', () => {
    const { container } = render(<DocumentSurfaceRenderer descriptor={{ ...draft, props: { ...draft.props,
      canonicalMarkdown: '[Untrusted link](https://example.test/collect)\n\n![Remote image](https://example.test/pixel)\n\n<script>signLetter()</script>\n\n<iframe src="https://example.test"></iframe>',
    } }} />);
    expect(container.querySelector('img, a[href], script, iframe')).toBeNull();
    expect(screen.getByText('Untrusted link')).toBeTruthy();
    expect(screen.getByText(/Image omitted: Remote image/)).toBeTruthy();
  });

  it('makes wide markdown tables and preformatted content keyboard reachable', () => {
    render(<DocumentSurfaceRenderer descriptor={{ ...draft, props: { ...draft.props,
      canonicalMarkdown: '| Source | Finding |\n| --- | --- |\n| Synthetic | Long content |\n\n```text\nlong-unbroken-content\n```',
    } }} />);
    const table = screen.getByRole('region', { name: 'Draft table' });
    const code = screen.getByRole('region', { name: 'Draft code' });
    expect(table.tabIndex).toBe(0);
    expect(code.tabIndex).toBe(0);
    expect(within(table).getByRole('table')).toBeTruthy();
    code.focus();
    expect(document.activeElement).toBe(code);
  });

  it('does not describe missing QA results as passed', () => {
    render(<DocumentSurfaceRenderer descriptor={{ surface: 'QaFindingsBlock', schema: 'aso.qa_findings.v1', slot: 'side', props: { findings: [] } }} />);
    expect(screen.getByText('No QA findings supplied')).toBeTruthy();
    expect(screen.queryByText('Pass')).toBeNull();
  });
});
