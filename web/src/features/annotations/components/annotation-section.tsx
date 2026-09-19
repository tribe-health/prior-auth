import { useMemo, useState } from 'react';

import { useCan, useRequiredSession } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AnnotationDraftInput } from '@/features/drafts/services/memory-draft-repository';
import { useAnnotationCommand } from '../hooks/use-annotation-command';
import { useAnnotationProjection } from '../hooks/use-annotation-projection';
import { useAnnotationTypeCatalog } from '../hooks/use-annotation-type-catalog';
import type { Annotation } from '../model/annotation';
import { AnnotationComposer } from './annotation-composer';
import { AttributedOpinionCard } from './attributed-opinion-card';

export function AnnotationSection({ caseId }: { caseId: string }) {
  const session = useRequiredSession();
  const canAnnotate = useCan('annotate');
  const projection = useAnnotationProjection(caseId, session.practiceId);
  const catalog = useAnnotationTypeCatalog();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{
    readonly annotationId: string;
    readonly initial: AnnotationDraftInput;
  } | null>(null);
  const command = useAnnotationCommand(caseId, projection.annotations);
  const editing = editingId === null
    ? null
    : projection.annotations.find((annotation) => annotation.id === editingId) ?? null;
  const initial = useMemo(
    () => creating?.initial ?? (editing ? draftFrom(editing) : null),
    [creating, editing],
  );
  const editorId = creating?.annotationId ?? editing?.id ?? null;
  const clinicalJudgment = catalog.types.find((type) => type.key === 'clinical-judgment');
  const startCreating = () => {
    if (!clinicalJudgment) return;
    setEditingId(null);
    setCreating({
      annotationId: crypto.randomUUID(),
      initial: {
        annotationTypeId: clinicalJudgment.id,
        name: clinicalJudgment.name,
        body: '',
        targetEvidenceId: null,
        targetDocumentId: null,
        disposition: 'held',
        expectedRevision: 0,
      },
    });
  };
  const closeEditor = () => {
    setCreating(null);
    setEditingId(null);
  };

  return (
    <section aria-labelledby="clinical-annotations-heading" className="flex flex-col gap-4 border-t pt-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="clinical-annotations-heading" className="font-heading text-base font-medium">Clinical annotations</h2>
          <p className="max-w-3xl text-sm text-ui-muted-foreground">
            Clinician opinion stays attributed and separate from chart evidence. Include or hold each point explicitly.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Badge variant="outline">{projection.annotations.length} recorded</Badge>
          {canAnnotate && projection.status === 'ready' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={!clinicalJudgment || command.pending || editorId !== null}
              onClick={startCreating}
            >
              Create annotation
            </Button>
          ) : null}
        </div>
      </header>

      {projection.status === 'pending' ? <p role="status" className="text-sm text-ui-muted-foreground">Loading annotations…</p> : null}
      {projection.status === 'error' ? <Alert variant="destructive"><AlertTitle>Annotations unavailable</AlertTitle><AlertDescription>{projection.error}</AlertDescription></Alert> : null}
      {command.message ? (
        <Alert variant={command.outcome === 'refused' || command.outcome === 'conflict' ? 'destructive' : 'default'}>
          <AlertTitle>{command.outcome === 'refused' ? 'Annotation refused' : command.outcome === 'conflict' ? 'Annotation changed' : 'Annotation status'}</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{command.message}</span>
            {command.canReconcile ? (
              <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => void command.lookupCommand().catch(() => undefined)}>
                Check annotation
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {canAnnotate && projection.status === 'ready' && catalog.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Annotation editor unavailable</AlertTitle>
          <AlertDescription>{catalog.error}</AlertDescription>
        </Alert>
      ) : null}
      {canAnnotate && projection.status === 'ready' && catalog.status === 'ready' && !clinicalJudgment ? (
        <Alert variant="destructive">
          <AlertTitle>Annotation editor unavailable</AlertTitle>
          <AlertDescription>The Clinical Judgment annotation type is unavailable.</AlertDescription>
        </Alert>
      ) : null}

      {editorId && initial ? (
        <AnnotationComposer
          key={editorId}
          caseId={caseId}
          annotationId={editorId}
          initial={initial}
          disabled={command.pending}
          onClose={closeEditor}
          onSave={async (draft) => {
            await command.save(editorId, draft);
            if (creating) closeEditor();
          }}
        />
      ) : null}

      {projection.status === 'ready' && projection.annotations.length === 0 ? (
        <Alert>
          <AlertTitle>No clinical annotations recorded</AlertTitle>
          <AlertDescription>
            An annotation cannot replace a missing record. Any future clinical point will remain separately attributed.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {projection.annotations.map((annotation) => (
            <AttributedOpinionCard
              key={annotation.id}
              annotation={annotation}
              canEdit={canAnnotate && !command.pending}
              onEdit={(selected) => {
                setCreating(null);
                setEditingId(selected.id);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function draftFrom(annotation: Annotation): AnnotationDraftInput {
  return {
    annotationTypeId: annotation.annotationTypeId,
    name: annotation.name,
    body: annotation.body,
    targetEvidenceId: annotation.targetEvidenceId,
    targetDocumentId: annotation.targetDocumentId,
    disposition: annotation.disposition,
    expectedRevision: annotation.revision,
  };
}
