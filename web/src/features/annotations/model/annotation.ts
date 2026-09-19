import type { AnnotationDisposition } from '@/features/drafts/services/memory-draft-repository';

export type { AnnotationDisposition };

export interface AnnotationType {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
}

export interface Annotation {
  readonly id: string;
  readonly caseId: string;
  readonly annotationTypeId: string;
  readonly name: string;
  readonly body: string;
  readonly authorId: string;
  readonly authorLabel: string;
  readonly provenance: string;
  readonly targetEvidenceId: string | null;
  readonly targetDocumentId: string | null;
  readonly disposition: AnnotationDisposition;
  readonly revision: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface AnnotationMutation {
  readonly commandId: string;
  readonly annotationId: string;
  readonly annotationTypeId: string;
  readonly name: string;
  readonly data: { readonly assertion: string };
  readonly body: string;
  readonly targetEvidenceId: string | null;
  readonly targetDocumentId: string | null;
  readonly disposition: AnnotationDisposition;
  readonly expectedRevision: number;
}

export interface AnnotationResult extends AnnotationMutation {
  readonly caseId: string;
  readonly authorId: string;
  readonly authorLabel: string;
  readonly provenance: string;
  readonly revision: number;
  readonly committedAt: string;
}
