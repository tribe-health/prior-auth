import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import { useApp } from '@modelcontextprotocol/ext-apps/react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DocumentSurfaceRenderer } from '@/features/document-generation/components/document-surface-renderer';
import {
  DOCUMENT_SURFACE_SCHEMAS,
  isBlockingQaFailure,
  parseDocumentAssembly,
  type DocumentPresentationState,
  type DocumentSource,
  type DocumentSurface,
} from '@/features/document-generation/model/document-surfaces';
import '@/index.css';

type ArtifactResult = {
  readonly assembly: ReturnType<typeof parseDocumentAssembly>;
  readonly letter: {
    readonly commandId: string;
    readonly letterId: string;
    readonly caseId: string;
    readonly letterVersion: number;
    readonly qaRevision: number;
    readonly status: 'draft' | 'in_review' | 'approved' | 'signed' | 'superseded';
    readonly committedAt: string;
  };
  readonly presentation: { readonly sourceReviewUrl: string };
};

const LETTER_STATUSES = ['draft', 'in_review', 'approved', 'signed', 'superseded'] as const;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function artifact(value: unknown, isError: boolean): ArtifactResult | null {
  if (isError || typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const assembly = parseDocumentAssembly(candidate.assembly);
  const letter = candidate.letter;
  const presentation = candidate.presentation;
  if (!assembly || typeof letter !== 'object' || letter === null || Array.isArray(letter)
    || typeof presentation !== 'object' || presentation === null || Array.isArray(presentation)) return null;
  const receipt = letter as Record<string, unknown>;
  const view = presentation as Record<string, unknown>;
  if (!nonempty(receipt.commandId) || !nonempty(receipt.letterId) || !nonempty(receipt.caseId)
    || !Number.isSafeInteger(receipt.letterVersion) || (receipt.letterVersion as number) < 1
    || !Number.isSafeInteger(receipt.qaRevision) || (receipt.qaRevision as number) < 1
    || !LETTER_STATUSES.includes(receipt.status as ArtifactResult['letter']['status'])
    || !nonempty(receipt.committedAt) || Number.isNaN(Date.parse(receipt.committedAt as string))
    || !nonempty(view.sourceReviewUrl)) return null;
  let sourceReviewUrl: URL;
  try {
    sourceReviewUrl = new URL(view.sourceReviewUrl as string);
  } catch {
    return null;
  }
  const encodedCaseId = encodeURIComponent(receipt.caseId as string);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(sourceReviewUrl.hostname);
  if (!((sourceReviewUrl.protocol === 'https:') || (sourceReviewUrl.protocol === 'http:' && loopback))
    || sourceReviewUrl.username || sourceReviewUrl.password || sourceReviewUrl.search || sourceReviewUrl.hash
    || sourceReviewUrl.pathname !== `/cases/${encodedCaseId}/evidence`) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return { assembly, letter: receipt as unknown as ArtifactResult['letter'], presentation: { sourceReviewUrl: sourceReviewUrl.toString() } };
}

function surfaces(value: ArtifactResult): { descriptors: readonly DocumentSurface[]; presentation: DocumentPresentationState } | null {
  const assembly = value.assembly;
  const letter = value.letter;
  if (!assembly) return null;
  const blocking = assembly.qa.filter(isBlockingQaFailure);
  const descriptors: DocumentSurface[] = [
    { surface: 'DraftPreviewBlock', schema: DOCUMENT_SURFACE_SCHEMAS.DraftPreviewBlock, slot: 'main', props: {
      kindKey: assembly.kindKey, kindVersion: assembly.kindVersion, class: 'clinical_correspondence',
      contentSha256: assembly.contentSha256, templateDigest: assembly.templateDigest,
      canonicalMarkdown: assembly.canonicalMarkdown, approvable: blocking.length === 0,
    } },
    { surface: 'QaFindingsBlock', schema: DOCUMENT_SURFACE_SCHEMAS.QaFindingsBlock, slot: 'side', props: { findings: assembly.qa } },
    { surface: 'ClaimsManifestBlock', schema: DOCUMENT_SURFACE_SCHEMAS.ClaimsManifestBlock, slot: 'side', props: { claims: assembly.renderedClaims } },
  ];
  if (blocking.length > 0) descriptors.push({
    surface: 'HaltMemoBlock', schema: DOCUMENT_SURFACE_SCHEMAS.HaltMemoBlock, slot: 'main',
    props: { blocking, routing: [] },
  });
  return {
    descriptors,
    presentation: { status: 'committed', documentId: letter.letterId, revision: String(letter.letterVersion), contentSha256: assembly.contentSha256 },
  };
}

function applyHostContext(context: McpUiHostContext) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  if (context.safeAreaInsets) {
    const { top, right, bottom, left } = context.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
}

function McpDocumentWorkspace() {
  const [result, setResult] = useState<ArtifactResult | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const onAppCreated = useCallback((app: Parameters<NonNullable<Parameters<typeof useApp>[0]['onAppCreated']>>[0]) => {
    app.ontoolresult = (toolResult) => {
      const next = artifact(toolResult.structuredContent, toolResult.isError === true);
      setResult(next);
      setInvalid(next === null);
      setSourceError(false);
    };
    app.onhostcontextchanged = applyHostContext;
    app.onteardown = async () => ({});
  }, []);
  const { app, isConnected, error } = useApp({
    appInfo: { name: 'aso-document-workspace', version: '1.0.0' },
    capabilities: {},
    onAppCreated,
  });
  useEffect(() => {
    if (!app || !isConnected) return;
    const context = app.getHostContext();
    if (context) applyHostContext(context);
  }, [app, isConnected]);
  const openSource = useCallback((source: DocumentSource) => {
    if (!app || !result) return;
    const url = new URL(result.presentation.sourceReviewUrl);
    url.searchParams.set('documentId', source.documentId);
    url.searchParams.set('page', String(source.page));
    setSourceError(false);
    void app.openLink({ url: url.toString() }).then((response) => {
      if (response.isError) setSourceError(true);
    }).catch(() => setSourceError(true));
  }, [app, result]);
  const rendered = result ? surfaces(result) : null;

  if (error) return <Alert variant="destructive"><AlertTitle>Document view unavailable</AlertTitle><AlertDescription>The host could not open this saved document.</AlertDescription></Alert>;
  if (!app || !isConnected) return <p role="status" aria-live="polite" className="p-4 text-sm text-ui-muted-foreground">Connecting to the document workspace…</p>;
  if (invalid || (result && !rendered)) return <Alert variant="destructive"><AlertTitle>Document result refused</AlertTitle><AlertDescription>The result does not match the approved document presentation contract.</AlertDescription></Alert>;
  if (!rendered) return <p role="status" aria-live="polite" className="p-4 text-sm text-ui-muted-foreground">Waiting for a saved document…</p>;

  return <section className="grid min-w-0 gap-4 p-3 sm:p-5" aria-label="Saved document workspace">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-heading text-xl font-semibold">Document review</h1>
      <Badge variant="outline">Saved to case · Clinical review required</Badge>
    </div>
    {sourceError ? <Alert variant="destructive"><AlertTitle>Source view unavailable</AlertTitle><AlertDescription>The host could not open the browser source review.</AlertDescription></Alert> : null}
    {rendered.descriptors.map((descriptor) => <DocumentSurfaceRenderer
      key={descriptor.surface}
      descriptor={descriptor}
      presentation={rendered.presentation}
      onOpenSource={openSource}
    />)}
  </section>;
}

const root = document.getElementById('root');
if (!root) throw new Error('MCP App root not found');
createRoot(root).render(<StrictMode><TooltipProvider><McpDocumentWorkspace /></TooltipProvider></StrictMode>);
