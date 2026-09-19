import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifiedSession } from '@/shared/model/session';
import { memoryDraftRepository, type AnnotationDraftInput } from '@/features/drafts/services/memory-draft-repository';

const SESSION: VerifiedSession = {
  identityId: 'identity-1',
  sessionId: 'session-1',
  userId: 'user-1',
  practiceId: 'practice-1',
  displayName: 'Synthetic Surgeon',
  capabilities: ['annotate'],
  principal: 'user',
  expiresAt: '2099-01-01T00:00:00Z',
  authorizationRevision: 'test:1',
};

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => SESSION,
  useSessionEpoch: () => 1,
}));

import { AnnotationComposer } from './annotation-composer';

const INITIAL: AnnotationDraftInput = {
  annotationTypeId: 'type-1',
  name: 'Clinical judgment',
  body: 'Initial synthetic opinion.',
  targetEvidenceId: 'evidence-1',
  targetDocumentId: null,
  disposition: 'held',
  expectedRevision: 1,
};

function composer() {
  return (
    <AnnotationComposer
      caseId="case-1"
      annotationId="annotation-1"
      initial={INITIAL}
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(null)}
    />
  );
}

beforeEach(() => {
  memoryDraftRepository.resetForTests();
  memoryDraftRepository.authorize(SESSION, 1);
});

afterEach(() => {
  cleanup();
  memoryDraftRepository.resetForTests();
});

describe('annotation editor continuity', () => {
  it('keeps one editor node, its caret and IME state while the layout crosses a breakpoint', () => {
    const view = render(composer());
    const editor = view.getByLabelText('Clinical point') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Synthetic revised opinion.' } });
    editor.setSelectionRange(10, 17);
    fireEvent.compositionStart(editor);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    fireEvent(window, new Event('resize'));

    const afterResize = view.getByLabelText('Clinical point') as HTMLTextAreaElement;
    expect(afterResize).toBe(editor);
    expect(afterResize.value).toBe('Synthetic revised opinion.');
    expect([afterResize.selectionStart, afterResize.selectionEnd]).toEqual([10, 17]);
    expect(afterResize.dataset.composing).toBe('true');
  });

  it('shares semantic draft text across views while each editor owns its selection', () => {
    const first = render(composer());
    const firstEditor = first.getByLabelText('Clinical point') as HTMLTextAreaElement;
    fireEvent.change(firstEditor, { target: { value: 'Draft shared across two views.' } });

    const second = render(composer());
    fireEvent.click(within(second.container).getByRole('button', { name: 'Review draft' }));
    const secondEditor = within(second.container).getByLabelText('Clinical point') as HTMLTextAreaElement;

    expect(firstEditor.value).toBe('Draft shared across two views.');
    expect(secondEditor.value).toBe('Draft shared across two views.');
    firstEditor.setSelectionRange(0, 5);
    secondEditor.setSelectionRange(12, 18);
    fireEvent.compositionStart(firstEditor);

    expect([firstEditor.selectionStart, firstEditor.selectionEnd]).toEqual([0, 5]);
    expect([secondEditor.selectionStart, secondEditor.selectionEnd]).toEqual([12, 18]);
    expect(firstEditor.dataset.composing).toBe('true');
    expect(secondEditor.dataset.composing).toBe('false');
  });
});
