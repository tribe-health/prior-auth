import { useId, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import type { AnnotationDraftInput } from '@/features/drafts/services/memory-draft-repository';
import { useAnnotationDraft } from '../hooks/use-annotation-draft';
import { AnnotationDisposition } from './annotation-disposition';

export function AnnotationComposer({
  caseId,
  annotationId,
  initial,
  disabled,
  onSave,
  onClose,
}: {
  caseId: string;
  annotationId: string;
  initial: AnnotationDraftInput;
  disabled?: boolean;
  onSave: (draft: AnnotationDraftInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const editorId = useId();
  const draft = useAnnotationDraft({ caseId, annotationId, initial });
  const [localError, setLocalError] = useState<string | null>(null);

  if (draft.hasRecoverableDraft) {
    return (
      <Alert>
        <AlertTitle>Unsent annotation available</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>Review this draft before returning it to the editor.</span>
          <span className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={draft.recover}>Review draft</Button>
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={draft.discard}>Discard draft</Button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  const submit = async () => {
    setLocalError(null);
    try {
      await onSave(draft.value);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div>
        <h3 className="font-heading text-base font-medium">Edit attributed clinical opinion</h3>
        <p className="text-sm text-ui-muted-foreground">
          This statement remains identified as your opinion. It does not supply a missing source document.
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor={editorId}>Clinical point</FieldLabel>
        <Textarea
          id={editorId}
          aria-label="Clinical point"
          value={draft.value.body}
          disabled={disabled || !draft.available}
          data-composing={draft.composing ? 'true' : 'false'}
          placeholder="State the clinical reasoning the chart does not carry."
          className="min-h-32 resize-y"
          onCompositionStart={draft.startComposition}
          onCompositionEnd={draft.endComposition}
          onChange={(event) => draft.save({ body: event.currentTarget.value })}
        />
        <FieldDescription>{draft.retentionNotice}</FieldDescription>
      </Field>
      <AnnotationDisposition
        value={draft.value.disposition}
        disabled={disabled || !draft.available}
        onChange={(disposition) => draft.save({ disposition })}
      />
      {localError ? <p role="alert" className="text-sm text-destructive">{localError}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onClose}>Close</Button>
        <Button
          type="button"
          className="min-h-11 w-full sm:w-auto"
          disabled={disabled || !draft.available || draft.value.body.trim().length === 0}
          onClick={() => void submit()}
        >
          Save annotation
        </Button>
      </div>
    </div>
  );
}
