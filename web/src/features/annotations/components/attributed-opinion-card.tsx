import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Annotation } from '../model/annotation';

export function AttributedOpinionCard({
  annotation,
  canEdit,
  onEdit,
}: {
  annotation: Annotation;
  canEdit: boolean;
  onEdit: (annotation: Annotation) => void;
}) {
  const target = annotation.targetEvidenceId
    ? 'Linked evidence'
    : annotation.targetDocumentId
      ? 'Linked document'
      : 'General clinical opinion';
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{annotation.name}</CardTitle>
        <CardDescription>
          {annotation.authorLabel} · {annotation.provenance} · revision {annotation.revision}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">
            {annotation.disposition === 'included' ? 'Included in letter' : 'Held out of letter'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap leading-relaxed">{annotation.body}</p>
        <div className="flex flex-col gap-2 text-xs text-ui-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{target}. Attributed opinion; it does not replace chart evidence.</span>
          {canEdit ? (
            <Button type="button" variant="outline" size="sm" className="min-h-11 w-full sm:w-auto" onClick={() => onEdit(annotation)}>
              Edit annotation
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
