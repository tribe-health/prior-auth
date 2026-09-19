import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttributedOpinionCard } from './attributed-opinion-card';

afterEach(cleanup);

describe('attributed opinion card', () => {
  it('names the author and disposition and does not present opinion as chart evidence', () => {
    render(<AttributedOpinionCard
      annotation={{
        id: 'annotation-1', caseId: 'case-1', annotationTypeId: 'type-1',
        name: 'Clinical judgment', body: 'Synthetic attributed opinion.',
        authorId: 'author-1', authorLabel: 'Synthetic Surgeon', provenance: 'surgeon',
        targetEvidenceId: 'evidence-1', targetDocumentId: null,
        disposition: 'held', revision: 2, createdAt: null, updatedAt: null,
      }}
      canEdit
      onEdit={vi.fn()}
    />);

    expect(screen.getByText(/Synthetic Surgeon · surgeon · revision 2/)).toBeTruthy();
    expect(screen.getByText('Held out of letter')).toBeTruthy();
    expect(screen.getByText(/Attributed opinion; it does not replace chart evidence/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit annotation' })).toBeTruthy();
  });
});
