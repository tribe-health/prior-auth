import type { VerifiedSession } from '@/shared/model/session';

export interface DraftAuthority {
  readonly identityId: string;
  readonly sessionId: string;
  readonly practiceId: string;
  readonly authorizationRevision: string;
  readonly epoch: number;
}

export interface CorrectionDraft {
  readonly kind: 'targeted-correction';
  readonly draftId: string;
  readonly caseId: string;
  readonly identityId: string;
  readonly practiceId: string;
  readonly baseRevision: string | null;
  readonly content: string;
  readonly updatedAt: string;
}

export interface CorrectionDraftInput {
  readonly baseRevision: string | null;
  readonly content: string;
}

export type AnnotationDisposition = 'included' | 'held';

export interface AnnotationDraft {
  readonly kind: 'annotation';
  readonly draftId: string;
  readonly caseId: string;
  readonly identityId: string;
  readonly practiceId: string;
  readonly annotationTypeId: string;
  readonly name: string;
  readonly body: string;
  readonly targetEvidenceId: string | null;
  readonly targetDocumentId: string | null;
  readonly disposition: AnnotationDisposition;
  readonly expectedRevision: number;
  readonly updatedAt: string;
}

export type AnnotationDraftInput = Pick<
  AnnotationDraft,
  | 'annotationTypeId'
  | 'name'
  | 'body'
  | 'targetEvidenceId'
  | 'targetDocumentId'
  | 'disposition'
  | 'expectedRevision'
>;

export interface AnnotationDraftHandle {
  readonly authority: DraftAuthority;
  readonly draftId: string;
  readonly caseId: string;
  readonly signal: AbortSignal;
  getSnapshot(): AnnotationDraft | null;
  subscribe(listener: () => void): () => void;
  save(input: AnnotationDraftInput): boolean;
  discard(): boolean;
}

export interface CorrectionDraftHandle {
  readonly authority: DraftAuthority;
  readonly draftId: string;
  readonly caseId: string;
  readonly signal: AbortSignal;
  getSnapshot(): CorrectionDraft | null;
  subscribe(listener: () => void): () => void;
  save(input: CorrectionDraftInput): boolean;
  discard(): boolean;
}

function authorityFor(session: VerifiedSession, epoch: number): DraftAuthority {
  return {
    identityId: session.identityId,
    sessionId: session.sessionId,
    practiceId: session.practiceId,
    authorizationRevision: session.authorizationRevision,
    epoch,
  };
}

function sameAuthority(left: DraftAuthority, right: DraftAuthority): boolean {
  return left.identityId === right.identityId
    && left.sessionId === right.sessionId
    && left.practiceId === right.practiceId
    && left.authorizationRevision === right.authorizationRevision
    && left.epoch === right.epoch;
}

function recordKey(authority: DraftAuthority, caseId: string, draftId: string): string {
  return JSON.stringify([authority.identityId, authority.practiceId, caseId, draftId]);
}

export class MemoryDraftRepository {
  readonly retention = {
    mode: 'memory-only' as const,
    notice: 'Saved only in this open application. Closing or reloading it will discard this draft.',
  };

  #authority: DraftAuthority | null = null;
  #generation = new AbortController();
  #records = new Map<string, CorrectionDraft | AnnotationDraft>();
  #listeners = new Map<string, Set<() => void>>();

  authorize(session: VerifiedSession, epoch: number): void {
    const next = authorityFor(session, epoch);
    if (this.#authority && sameAuthority(this.#authority, next)) return;
    this.#quarantineCurrent();
    this.#authority = next;
    this.#generation = new AbortController();
  }

  quarantine(): number {
    const retained = this.#authority
      ? [...this.#records.values()].filter((draft) => (
        draft.identityId === this.#authority?.identityId
        && draft.practiceId === this.#authority.practiceId
      )).length
      : 0;
    this.#quarantineCurrent();
    this.#authority = null;
    return retained;
  }

  open(caseId: string, draftId: string): CorrectionDraftHandle | null {
    const capturedAuthority = this.#authority;
    const capturedGeneration = this.#generation;
    if (!capturedAuthority || capturedGeneration.signal.aborted) return null;
    const key = recordKey(capturedAuthority, caseId, draftId);
    const isCurrent = () => Boolean(
      this.#authority
      && sameAuthority(this.#authority, capturedAuthority)
      && !capturedGeneration.signal.aborted,
    );
    return {
      authority: capturedAuthority,
      caseId,
      draftId,
      signal: capturedGeneration.signal,
      getSnapshot: () => {
        const draft = isCurrent() ? this.#records.get(key) : null;
        return draft?.kind === 'targeted-correction' ? draft : null;
      },
      subscribe: (listener) => {
        const listeners = this.#listeners.get(key) ?? new Set<() => void>();
        listeners.add(listener);
        this.#listeners.set(key, listeners);
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) this.#listeners.delete(key);
        };
      },
      save: (input) => {
        if (!isCurrent()) return false;
        this.#records.set(key, {
          kind: 'targeted-correction',
          draftId,
          caseId,
          identityId: capturedAuthority.identityId,
          practiceId: capturedAuthority.practiceId,
          baseRevision: input.baseRevision,
          content: input.content,
          updatedAt: new Date().toISOString(),
        });
        this.#notify(key);
        return true;
      },
      discard: () => {
        if (!isCurrent()) return false;
        const removed = this.#records.delete(key);
        if (removed) this.#notify(key);
        return removed;
      },
    };
  }

  openAnnotation(caseId: string, draftId: string): AnnotationDraftHandle | null {
    const capturedAuthority = this.#authority;
    const capturedGeneration = this.#generation;
    if (!capturedAuthority || capturedGeneration.signal.aborted) return null;
    const key = recordKey(capturedAuthority, caseId, draftId);
    const isCurrent = () => Boolean(
      this.#authority
      && sameAuthority(this.#authority, capturedAuthority)
      && !capturedGeneration.signal.aborted,
    );
    return {
      authority: capturedAuthority,
      caseId,
      draftId,
      signal: capturedGeneration.signal,
      getSnapshot: () => {
        const draft = isCurrent() ? this.#records.get(key) : null;
        return draft?.kind === 'annotation' ? draft : null;
      },
      subscribe: (listener) => {
        const listeners = this.#listeners.get(key) ?? new Set<() => void>();
        listeners.add(listener);
        this.#listeners.set(key, listeners);
        return () => {
          listeners.delete(listener);
          if (listeners.size === 0) this.#listeners.delete(key);
        };
      },
      save: (input) => {
        if (!isCurrent()) return false;
        this.#records.set(key, {
          kind: 'annotation',
          draftId,
          caseId,
          identityId: capturedAuthority.identityId,
          practiceId: capturedAuthority.practiceId,
          ...input,
          updatedAt: new Date().toISOString(),
        });
        this.#notify(key);
        return true;
      },
      discard: () => {
        if (!isCurrent()) return false;
        const removed = this.#records.delete(key);
        if (removed) this.#notify(key);
        return removed;
      },
    };
  }

  resetForTests(): void {
    this.#quarantineCurrent();
    this.#authority = null;
    this.#records.clear();
    this.#listeners.clear();
  }

  #quarantineCurrent(): void {
    this.#generation.abort();
    for (const listeners of this.#listeners.values()) {
      for (const listener of listeners) listener();
    }
  }

  #notify(key: string): void {
    for (const listener of this.#listeners.get(key) ?? []) listener();
  }
}

export const memoryDraftRepository = new MemoryDraftRepository();
