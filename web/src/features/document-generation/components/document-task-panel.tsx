import { useCallback, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SourcePreview } from '@/features/source-preview/components/source-preview';
import { useSourcePreview } from '@/features/source-preview/hooks/use-source-preview';
import type { DocumentPresentationState, DocumentSource } from '../model/document-surfaces';
import { pausedTask, terminalTask, type DocumentTaskArtifacts } from '../model/document-task';
import type { TaskChannelState } from '../services/document-task-channel';
import type { DocumentTaskStatusProjection } from '../hooks/use-document-task-status';
import { ClaimsManifestBlock, DraftPreviewBlock, QaFindingsBlock, type DocumentLifecycleStatus } from './document-blocks';
import { DocumentSurfaceRenderer } from './document-surface-renderer';

const STAGES: Record<string, string> = {
  submitted: 'Request accepted', working: 'Assembling document', retrieval: 'Reviewing authorized evidence',
  synthesis: 'Preparing cited statements', assembly: 'Rendering the document', qa: 'Checking citations and criteria',
  persistence: 'Saving the validated document', completed: 'Document saved', canceled: 'Generation canceled',
  failed: 'Generation failed', rejected: 'Request refused', 'input-required': 'Review required', 'auth-required': 'Authorization required',
};

export function DocumentTaskPanel({ caseId, state, replicatedStatus, canManage, onReconnect, onCancel, onResume, onNewRequest, savedLetterId, savedLetterStatus, savedArtifacts }: {
  readonly caseId: string;
  readonly state: TaskChannelState;
  readonly replicatedStatus?: DocumentTaskStatusProjection;
  readonly canManage: boolean;
  readonly onReconnect: () => void;
  readonly onCancel: () => void;
  readonly onResume: () => void;
  readonly onNewRequest?: () => void;
  readonly savedLetterId?: string;
  readonly savedLetterStatus?: DocumentLifecycleStatus;
  readonly savedArtifacts?: DocumentTaskArtifacts | null;
}) {
  const preview = useSourcePreview(caseId);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const openSource = useCallback((source: DocumentSource, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    void preview.open({ caseId, id: `${source.documentId}:${source.page}`, documentId: source.documentId,
      documentName: source.title, effectiveDate: source.effectiveDate, pageNumber: source.page, relevance: source.sourceQuote });
  }, [caseId, preview]);
  const closeSource = useCallback(() => {
    preview.close();
    triggerRef.current?.focus();
  }, [preview]);
  const task = state.task;
  const stableTask = replicatedStatus?.status === 'ready'
    ? replicatedStatus.task
    : null;
  const artifact = savedArtifacts ?? (state.artifacts && (!savedLetterId || state.artifacts.letter.letterId === savedLetterId) ? state.artifacts : null);
  const assembly = artifact?.assembly;
  const presentation: DocumentPresentationState | undefined = artifact ? {
    status: 'committed', documentId: artifact.letter.letterId, revision: String(artifact.letter.letterVersion), contentSha256: artifact.assembly.contentSha256,
  } : undefined;
  if (!state.command && !task && !artifact && !stableTask) return null;
  return <div className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">
    {!savedLetterId ? <Card className="min-w-0"><CardHeader><CardTitle>Document generation</CardTitle></CardHeader><CardContent className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className="text-sm">{state.connection === 'disconnected' ? 'Connection interrupted' : STAGES[state.stage || stableTask?.stage || ''] ?? 'Preparing the document'}</p><Badge variant="outline" className="max-w-full whitespace-normal">{artifact ? 'Saved to case' : stableTask && !task ? 'Saved task status' : 'Provisional · Not saved'}</Badge></div>
      {state.message ? <Alert><AlertTitle>Task update</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap gap-2">
        {state.connection === 'disconnected' ? <Button className="min-h-11" variant="outline" onClick={onReconnect}>Reconnect to same request</Button> : null}
        {task && pausedTask(task) ? <Button className="min-h-11" disabled={!canManage} onClick={onResume}>Resume task</Button> : null}
        {task && !terminalTask(task) ? <Button className="min-h-11" variant="outline" disabled={!canManage} onClick={onCancel}>Cancel generation</Button> : null}
        {onNewRequest && (state.startRefused || (task && terminalTask(task) && task.state !== 'completed')) ? <Button className="min-h-11" variant="outline" disabled={!canManage} onClick={onNewRequest}>Review case for a new request</Button> : null}
      </div>
      {stableTask && (!task || state.connection === 'disconnected') ? <p role="status" aria-live="polite" className="text-sm text-ui-muted-foreground">Saved task status: {STAGES[stableTask.stage] ?? stableTask.state}. Event {stableTask.lastSequence}.</p> : null}
    </CardContent></Card> : null}
    {state.provisionalText && !savedLetterId ? <Card className="min-w-0"><CardHeader><CardTitle>Provisional draft</CardTitle><p className="text-sm text-ui-muted-foreground">Not saved. The host is validating persistence.</p></CardHeader><CardContent><pre tabIndex={0} aria-label="Provisional document text" className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words font-serif text-sm leading-7">{state.provisionalText}</pre></CardContent></Card> : null}
    {!savedLetterId ? state.surfaces.map((descriptor, index) => <DocumentSurfaceRenderer key={index} descriptor={descriptor} onOpenSource={openSource} />) : null}
    {assembly ? <div className="@container/document grid min-w-0 gap-4"><DraftPreviewBlock data={{ ...assembly, class: 'clinical_correspondence', approvable: assembly.qa.every((finding) => finding.severity !== 'blocking' || finding.outcome === 'pass') }} presentation={presentation} lifecycleStatus={savedLetterStatus} /><div className="grid min-w-0 gap-4 @min-[60rem]/document:grid-cols-2 [&>*]:min-w-0"><QaFindingsBlock data={{ findings: assembly.qa }} presentation={presentation} /><ClaimsManifestBlock data={{ claims: assembly.renderedClaims }} presentation={presentation} onOpenSource={openSource} /></div></div> : null}
    <SourcePreview state={preview.state} onClose={closeSource} onPageChange={(page) => { void preview.goToPage(page); }} />
  </div>;
}
