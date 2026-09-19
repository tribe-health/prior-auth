import { useEffect, useRef } from 'react';
import { FileText, RefreshCw, Upload } from 'lucide-react';

import { useCan } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress, ProgressLabel } from '@/components/ui/progress';
import { SourcePreview } from '@/features/source-preview/components/source-preview';
import { useSourcePreview } from '@/features/source-preview/hooks/use-source-preview';
import type { SourcePreviewTarget } from '@/features/source-preview/model/source-preview';
import { useDocumentStatuses } from '../hooks/use-document-statuses';
import { useDocumentUpload } from '../hooks/use-document-upload';
import {
  DOCUMENT_PROCESSING_FAILED_MESSAGE,
  DOCUMENT_TYPES,
  documentStatusLabel,
  type DocumentProcessingStatus,
  type DocumentStatusRecord,
} from '../model/document-intake';

export function DocumentIntake({
  caseId,
  caseInputRevision,
  documentSetRevision,
}: {
  readonly caseId: string;
  readonly caseInputRevision: number;
  readonly documentSetRevision: number;
}) {
  const projection = useDocumentStatuses(caseId);
  const documents = projection.status === 'ready' ? projection.documents : [];
  const upload = useDocumentUpload(caseId, caseInputRevision, documentSetRevision, documents);
  const sourcePreview = useSourcePreview(caseId);
  const canUpload = useCan('document_upload');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (upload.draft.file === null && fileInputRef.current) fileInputRef.current.value = '';
  }, [upload.draft.file]);

  const closeSourcePreview = () => {
    sourcePreview.close();
    const trigger = sourceTriggerRef.current;
    sourceTriggerRef.current = null;
    queueMicrotask(() => trigger?.focus());
  };

  const openSource = (document: DocumentStatusRecord, trigger: HTMLButtonElement) => {
    const target: SourcePreviewTarget = {
      id: `document-status:${document.id}`,
      caseId,
      documentId: document.id,
      documentName: document.name,
      effectiveDate: document.effectiveDate,
      pageNumber: 1,
      relevance: 'Uploaded case source',
    };
    sourceTriggerRef.current = trigger;
    void sourcePreview.open(target);
  };

  return (
    <Card aria-labelledby="document-intake-title">
      <CardHeader>
        <CardTitle id="document-intake-title">Case documents</CardTitle>
        <CardDescription>
          Upload a PDF or text document with its source date. Processing status updates from committed case data.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {!canUpload ? (
          <Alert variant="destructive">
            <AlertTitle>Document upload unavailable</AlertTitle>
            <AlertDescription>You do not have permission to perform this action.</AlertDescription>
          </Alert>
        ) : null}

        <form
          className="grid gap-4 rounded-lg border bg-ui-muted/20 p-3 sm:grid-cols-2 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void upload.submit();
          }}
        >
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="case-document-file">Document file</Label>
            <Input
              ref={fileInputRef}
              id="case-document-file"
              type="file"
              accept="application/pdf,text/plain,.pdf,.txt"
              className="min-h-11 py-2"
              disabled={!canUpload || upload.pending}
              onChange={(event) => upload.selectFile(event.currentTarget.files?.[0] ?? null)}
            />
            <p className="text-xs text-ui-muted-foreground">PDF or UTF-8 text · 16 MiB maximum</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="case-document-type">Document type</Label>
            <NativeSelect
              id="case-document-type"
              className="w-full"
              value={upload.draft.documentTypeKey}
              disabled={!canUpload || upload.pending}
              onChange={(event) => upload.updateDraft({ documentTypeKey: event.currentTarget.value })}
            >
              {DOCUMENT_TYPES.map(([key, label]) => (
                <NativeSelectOption key={key} value={key}>{label}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="case-document-date">Source date</Label>
            <Input
              id="case-document-date"
              type="date"
              className="min-h-11"
              value={upload.draft.effectiveDate}
              disabled={!canUpload || upload.pending}
              onChange={(event) => upload.updateDraft({ effectiveDate: event.currentTarget.value })}
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="case-document-name">Document name</Label>
            <Input
              id="case-document-name"
              className="min-h-11"
              value={upload.draft.name}
              disabled={!canUpload || upload.pending}
              onChange={(event) => upload.updateDraft({ name: event.currentTarget.value })}
            />
          </div>

          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ui-muted-foreground">
              Source content remains on the protected server. Only processing metadata is synchronized.
            </p>
            <Button
              type="submit"
              className="min-h-11 w-full motion-reduce:transition-none sm:w-auto"
              disabled={!canUpload || upload.pending}
            >
              <Upload aria-hidden="true" /> Upload document
            </Button>
          </div>
        </form>

        {upload.outcome === 'submitting' ? (
          <Progress value={null} aria-label="Uploading document" aria-live="polite">
            <ProgressLabel>Preparing and uploading the document…</ProgressLabel>
          </Progress>
        ) : null}

        {upload.message ? (
          <Alert variant={upload.outcome === 'refused' || upload.outcome === 'conflict' ? 'destructive' : 'default'}>
            <AlertTitle>{uploadTitle(upload.outcome)}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span aria-live="polite">{upload.message}</span>
              {upload.canReconcile ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => { void upload.reconcile(); }}
                >
                  <RefreshCw aria-hidden="true" /> Check upload
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <DocumentStatusList
          projection={projection}
          onOpenSource={openSource}
        />
      </CardContent>
      <SourcePreview
        state={sourcePreview.state}
        onClose={closeSourcePreview}
        onPageChange={(page) => { void sourcePreview.goToPage(page); }}
      />
    </Card>
  );
}

function DocumentStatusList({
  projection,
  onOpenSource,
}: {
  readonly projection: ReturnType<typeof useDocumentStatuses>;
  readonly onOpenSource: (document: DocumentStatusRecord, trigger: HTMLButtonElement) => void;
}) {
  if (projection.status === 'pending') {
    return <p role="status" className="text-sm text-ui-muted-foreground">Loading committed document status…</p>;
  }
  if (projection.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Document status unavailable</AlertTitle>
        <AlertDescription>{projection.error}</AlertDescription>
      </Alert>
    );
  }
  if (projection.documents.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-ui-muted-foreground">No documents uploaded for this case.</p>;
  }
  return (
    <section aria-labelledby="document-status-heading" className="grid gap-3">
      <h3 id="document-status-heading" className="text-sm font-medium">Processing status</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="document-status-grid">
        {projection.documents.map((document) => (
          <li key={document.id} className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-ui-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={document.name}>{document.name}</p>
                <p className="font-mono text-xs text-ui-muted-foreground">Source date {document.effectiveDate}</p>
              </div>
              <Badge variant={statusVariant(document.processingStatus)}>
                {documentStatusLabel(document.processingStatus)}
              </Badge>
            </div>
            <p className="text-xs text-ui-muted-foreground">
              {document.pageCount === null
                ? 'Page count pending'
                : `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}`}
            </p>
            {document.processingStatus === 'failed' ? (
              <p className="text-sm text-destructive">{DOCUMENT_PROCESSING_FAILED_MESSAGE}</p>
            ) : null}
            {document.processingStatus === 'ready' ? (
              <Button
                type="button"
                variant="outline"
                className="mt-auto min-h-11 w-full motion-reduce:transition-none"
                onClick={(event) => onOpenSource(document, event.currentTarget)}
              >
                Open source
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function uploadTitle(outcome: ReturnType<typeof useDocumentUpload>['outcome']): string {
  if (outcome === 'confirmed') return 'Document uploaded';
  if (outcome === 'uncertain') return 'Upload result unknown';
  if (outcome === 'awaiting-projection') return 'Upload accepted';
  return 'Document upload not completed';
}

function statusVariant(status: DocumentProcessingStatus): 'default' | 'destructive' | 'outline' {
  if (status === 'ready') return 'default';
  if (status === 'failed') return 'destructive';
  return 'outline';
}
