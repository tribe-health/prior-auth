import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ pendingAction: null as 'review' | 'approve' | null, checkPending: vi.fn(), status: 'draft' }));

vi.mock('@/app/providers/session-provider', () => ({ useCan: () => true }));
vi.mock('@/features/letter-signing/components/letter-signing-card', () => ({ LetterSigningCard: () => <div data-testid="sign-card" /> }));
vi.mock('@/features/document-generation/components/document-task-panel', () => ({ DocumentTaskPanel: () => null }));
vi.mock('../hooks/use-letter-workflow', () => ({ useLetterWorkflow: () => ({
  view: { phase: 'ready', message: null, letter: { id: 'synthetic-letter', purpose: 'prior_authorization_request', version: 1,
    status: actions.status, generatedAt: '2026-09-19T00:00:00Z', claims: [],
    bodyMarkdown: '# Synthetic historical letter\n\n[Source](https://outside.invalid/collect) ![Scan](https://outside.invalid/pixel)\n\n<script>sign()</script><iframe src="https://outside.invalid/embed"></iframe>',
  } }, generation: { state: {} }, savedArtifacts: null, pendingAction: actions.pendingAction, checkPending: actions.checkPending,
  generate: vi.fn(), review: vi.fn(), approve: vi.fn(), newRequest: vi.fn(),
}) }));
import { LetterWorkspace } from './letter-workspace';

afterEach(() => { cleanup(); actions.pendingAction = null; actions.status = 'draft'; vi.clearAllMocks(); });
it('renders historical Markdown without remote media, navigation or raw HTML', () => {
  const { container } = render(<LetterWorkspace caseId="synthetic-case" letterId="synthetic-letter" onGenerated={vi.fn()} />);
  expect(container.textContent).toContain('Synthetic historical letter');
  expect(container.querySelector('a[href], img, iframe, script')).toBeNull();
  expect(container.textContent).toContain('Image omitted');
});

it.each(['draft', 'in_review', 'approved'])('offers only reconciliation while a clinical request is uncertain: %s', (status) => {
  actions.pendingAction = 'review';
  actions.status = status;
  render(<LetterWorkspace caseId="synthetic-case" letterId="synthetic-letter" onGenerated={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /confirm source review|approve current revision/i })).toBeNull();
  expect(screen.queryByTestId('sign-card')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Check the same clinical request' }));
  expect(actions.checkPending).toHaveBeenCalledTimes(1);
});
