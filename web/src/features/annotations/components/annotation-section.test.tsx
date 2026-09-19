import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnnotationDraftInput } from '@/features/drafts/services/memory-draft-repository';

const mocks = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(null),
  catalog: {
    status: 'ready' as 'ready' | 'pending' | 'error',
    types: [{
      id: 'type-clinical-judgment',
      key: 'clinical-judgment',
      name: 'Clinical Judgment',
      description: 'Synthetic type description.',
    }],
    error: null as string | null,
  },
}));

vi.mock('@/app/providers/session-provider', () => ({
  useRequiredSession: () => ({ practiceId: 'practice-1' }),
  useCan: () => true,
}));

vi.mock('../hooks/use-annotation-projection', () => ({
  useAnnotationProjection: () => ({ status: 'ready', annotations: [], error: null }),
}));

vi.mock('../hooks/use-annotation-type-catalog', () => ({
  useAnnotationTypeCatalog: () => mocks.catalog,
}));

vi.mock('../hooks/use-annotation-command', () => ({
  useAnnotationCommand: () => ({
    pending: false,
    message: null,
    outcome: null,
    canReconcile: false,
    lookupCommand: vi.fn(),
    save: mocks.save,
  }),
}));

vi.mock('./annotation-composer', () => ({
  AnnotationComposer: ({
    annotationId,
    initial,
    onSave,
  }: {
    annotationId: string;
    initial: AnnotationDraftInput;
    onSave: (draft: AnnotationDraftInput) => Promise<unknown>;
  }) => (
    <div aria-label="Synthetic annotation composer">
      <span>{annotationId}</span>
      <span>{`${initial.annotationTypeId}|${initial.name}|${initial.disposition}|${initial.expectedRevision}`}</span>
      <button type="button" onClick={() => void onSave({ ...initial, body: 'Synthetic clinical opinion.' })}>
        Submit first annotation
      </button>
    </div>
  ),
}));

import { AnnotationSection } from './annotation-section';

afterEach(() => {
  cleanup();
  mocks.save.mockClear();
  mocks.catalog.status = 'ready';
  mocks.catalog.types = [{
    id: 'type-clinical-judgment',
    key: 'clinical-judgment',
    name: 'Clinical Judgment',
    description: 'Synthetic type description.',
  }];
  mocks.catalog.error = null;
});

describe('first annotation workflow', () => {
  it('creates a revision-zero held draft and submits it through the command hook', async () => {
    const view = render(<AnnotationSection caseId="case-1" />);

    fireEvent.click(view.getByRole('button', { name: 'Create annotation' }));
    expect(view.getByText('type-clinical-judgment|Clinical Judgment|held|0')).toBeTruthy();
    const annotationId = view.getByLabelText('Synthetic annotation composer').querySelector('span')!
      .textContent!;
    expect(annotationId).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.click(view.getByRole('button', { name: 'Submit first annotation' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(annotationId, {
      annotationTypeId: 'type-clinical-judgment',
      name: 'Clinical Judgment',
      body: 'Synthetic clinical opinion.',
      targetEvidenceId: null,
      targetDocumentId: null,
      disposition: 'held',
      expectedRevision: 0,
    }));
    await waitFor(() => expect(view.queryByLabelText('Synthetic annotation composer')).toBeNull());
  });

  it('fails explicitly when the required catalog type is absent', () => {
    mocks.catalog.types = [];
    const view = render(<AnnotationSection caseId="case-1" />);

    expect(view.getByText('The Clinical Judgment annotation type is unavailable.')).toBeTruthy();
    expect((view.getByRole('button', { name: 'Create annotation' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });
});
