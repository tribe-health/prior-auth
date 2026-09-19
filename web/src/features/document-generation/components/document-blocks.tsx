import { useId, type ReactNode } from 'react';
import { FileSearch } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import {
  isBlockingQaFailure,
  type ClaimsManifestProps,
  type DocumentPresentationState,
  type DocumentSource,
  type DraftPreviewProps,
  type HaltMemoProps,
  type QaCheck,
  type QaFinding,
  type QaFindingsProps,
} from '../model/document-surfaces';

export type SourceOpenHandler = (source: DocumentSource, trigger: HTMLButtonElement) => void;
export type PresentationProps = { readonly presentation?: DocumentPresentationState };
export type DocumentLifecycleStatus = 'draft' | 'in_review' | 'approved' | 'signed' | 'superseded';

const CHECK_LABELS: Record<QaCheck, string> = {
  unsupported_claim: 'Source support',
  annotation_attribution: 'Clinical attribution',
  criterion_coverage: 'Required criteria',
  policy_version_currency: 'Policy version',
  code_consistency: 'Procedure codes',
  date_consistency: 'Date consistency',
  readability: 'Readability',
};

const OUTCOME_LABELS = { pass: 'Pass', fail: 'Fail', not_applicable: 'Not applicable' };
const SEVERITY_LABELS = { blocking: 'Blocking', warning: 'Warning', advisory: 'Advisory' };

function BlockFrame({ title, description, presentation, children }: PresentationProps & {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <Card className="min-w-0" role="region" aria-labelledby={headingId}>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <CardTitle><h2 id={headingId}>{title}</h2></CardTitle>
          <Badge variant="outline" className="h-auto max-w-full whitespace-normal motion-reduce:transition-none">
            {presentation?.status === 'committed' ? 'Saved to case' : 'Provisional · Not saved'}
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
        {presentation?.status === 'committed' ? (
          <p className="break-all font-mono text-xs text-subtle">Revision {presentation.revision}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 [overflow-wrap:anywhere]">{children}</CardContent>
    </Card>
  );
}

/** Untrusted Markdown has no remote media, raw HTML or navigation authority. */
const markdownComponents: Components = {
  h1: ({ children }) => <h3 className="font-display text-2xl font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="font-display text-xl font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span className="text-sm text-subtle">Image omitted{alt ? `: ${alt}` : ''}. Open the source document to review images.</span>,
  table: ({ children }) => (
    <div role="region" aria-label="Draft table" tabIndex={0} className="max-w-full overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-focus">
      <table className="w-full border-collapse text-left text-sm [&_td]:border [&_td]:border-chrome [&_td]:p-2 [&_th]:border [&_th]:border-chrome [&_th]:bg-surface [&_th]:p-2">{children}</table>
    </div>
  ),
  pre: ({ children }) => (
    <pre role="region" aria-label="Draft code" tabIndex={0} className="max-w-full overflow-x-auto rounded-md bg-surface p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-focus">{children}</pre>
  ),
};

export function DraftPreviewBlock({ data, presentation, lifecycleStatus }: PresentationProps & { readonly data: DraftPreviewProps; readonly lifecycleStatus?: DocumentLifecycleStatus }) {
  // A host receipt for another body must never mark this provisional draft saved.
  const matchingPresentation = presentation?.status === 'committed'
    && presentation.contentSha256 !== data.contentSha256 ? undefined : presentation;
  const title = lifecycleStatus === 'signed' ? 'Signed document' : lifecycleStatus === 'approved' ? 'Approved document' : 'Draft preview';
  const description = lifecycleStatus === 'signed'
    ? 'Signed revision. Its source citations and QA findings remain available for review.'
    : lifecycleStatus === 'approved'
      ? 'Approved revision awaiting signature. Review its source citations and QA findings.'
      : 'Unsigned document. Review the text with its source citations and QA findings.';
  return (
    <BlockFrame title={title} description={description} presentation={matchingPresentation}>
      {!data.approvable ? <Alert variant="destructive"><AlertTitle>Blocking checks require review</AlertTitle><AlertDescription>The draft cannot proceed while a blocking QA check has failed.</AlertDescription></Alert> : null}
      <article aria-label="Canonical draft" className="grid min-w-0 gap-4 bg-canvas p-3 text-sm leading-7 sm:p-5 [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
        <Markdown remarkPlugins={[remarkGfm]} skipHtml components={markdownComponents}>{data.canonicalMarkdown}</Markdown>
      </article>
      <details className="text-xs text-subtle">
        <summary className="min-h-11 cursor-pointer py-3 text-sm">Document provenance</summary>
        <dl className="grid gap-3 pb-2">
          <div><dt>Document kind</dt><dd className="font-mono">{data.kindKey} · version {data.kindVersion}</dd></div>
          <div><dt>Content hash</dt><dd className="break-all font-mono">{data.contentSha256}</dd></div>
          <div><dt>Template digest</dt><dd className="break-all font-mono">{data.templateDigest}</dd></div>
        </dl>
      </details>
    </BlockFrame>
  );
}

function Finding({ finding }: { readonly finding: QaFinding }) {
  return (
    <li className="grid gap-2 border-b border-chrome pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{CHECK_LABELS[finding.check]}</h3>
        <Badge variant={isBlockingQaFailure(finding) ? 'destructive' : 'outline'} className="h-auto max-w-full whitespace-normal motion-reduce:transition-none">
          {SEVERITY_LABELS[finding.severity]} · {OUTCOME_LABELS[finding.outcome]}
        </Badge>
      </div>
      <p className="text-sm leading-6">{finding.detail}</p>
    </li>
  );
}

export function QaFindingsBlock({ data, presentation }: PresentationProps & { readonly data: QaFindingsProps }) {
  const blocking = data.findings.filter(isBlockingQaFailure);
  return (
    <BlockFrame title="QA findings" description="Each check retains its severity and outcome." presentation={presentation}>
      {blocking.length > 0 ? <Alert variant="destructive"><AlertTitle>{blocking.length} blocking {blocking.length === 1 ? 'failure' : 'failures'}</AlertTitle><AlertDescription>These findings stop the document from proceeding. Review each failed check.</AlertDescription></Alert> : null}
      {data.findings.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>No QA findings supplied</EmptyTitle><EmptyDescription>There is no QA result to review.</EmptyDescription></EmptyHeader></Empty>
      ) : <ul className="grid gap-4">{data.findings.map((finding, index) => <Finding key={`${finding.check}-${index}`} finding={finding} />)}</ul>}
    </BlockFrame>
  );
}

export function ClaimsManifestBlock({ data, presentation, onOpenSource }: PresentationProps & {
  readonly data: ClaimsManifestProps;
  readonly onOpenSource?: SourceOpenHandler;
}) {
  return (
    <BlockFrame title="Claims and sources" description="Every rendered assertion retains its source or clinical attribution." presentation={presentation}>
      {data.claims.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>No rendered assertions</EmptyTitle><EmptyDescription>No clinical claims were included in this result.</EmptyDescription></EmptyHeader></Empty>
      ) : <ol className="grid gap-6">{data.claims.map((claim) => {
        const source = claim.provenance;
        return (
          <li key={claim.ordinal} className="grid min-w-0 gap-3 border-b border-chrome pb-5 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-start gap-2"><Badge variant="outline" className="motion-reduce:transition-none">Claim {claim.ordinal}</Badge>{claim.criterionId ? <span className="text-xs text-subtle">Criterion {claim.criterionId}</span> : null}</div>
            <p className="text-sm leading-6">{claim.text}</p>
            {source.kind !== 'document' ? <p className="text-sm leading-6">Clinical judgment of {source.author} · {source.authoredOn}</p> : null}
            {source.kind === 'annotation' ? (
              <Alert><AlertTitle>Internal clinical opinion</AlertTitle><AlertDescription>This assertion has no source document. It will not be included in external correspondence.</AlertDescription></Alert>
            ) : (
              <div className="grid min-w-0 gap-2">
                <p className="text-xs leading-5 text-subtle">{source.title} · page {source.page} · {source.effectiveDate} · version {source.documentVersion}</p>
                {source.sourceQuote ? <blockquote className="rounded-md bg-surface px-3 py-2 text-sm leading-6">“{source.sourceQuote}”</blockquote> : <p className="text-xs text-subtle">No source quotation supplied.</p>}
                <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full justify-self-start whitespace-normal motion-reduce:transition-none" disabled={!onOpenSource} onClick={(event) => onOpenSource?.(source, event.currentTarget)} aria-label={`Open source for claim ${claim.ordinal}: ${source.title}, page ${source.page}`}>
                  <FileSearch data-icon="inline-start" aria-hidden="true" />Open source
                </Button>
                {!onOpenSource ? <p className="text-xs text-subtle">Source preview is unavailable in this view.</p> : null}
              </div>
            )}
          </li>
        );
      })}</ol>}
    </BlockFrame>
  );
}

export function HaltMemoBlock({ data, presentation }: PresentationProps & { readonly data: HaltMemoProps }) {
  return (
    <BlockFrame title="Halt memo" description="Resolve the blocking findings before the document proceeds." presentation={presentation}>
      <Alert variant="destructive"><AlertTitle>Document halted</AlertTitle><AlertDescription>The current result contains blocking QA failures.</AlertDescription></Alert>
      <ul className="grid gap-4">{data.blocking.map((finding, index) => <Finding key={`${finding.check}-${index}`} finding={finding} />)}</ul>
      {data.routing.length > 0 ? <div className="grid gap-3"><h3 className="font-semibold">Evidence worklist</h3><ul className="grid gap-4">{data.routing.map((item, index) => (
        <li key={`${item.criterion}-${index}`} className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="motion-reduce:transition-none">{item.state === 'gap' ? 'Gap' : 'Void'}</Badge><span className="text-sm">Criterion {item.criterion}</span></div>
          <p className="text-sm leading-6">{item.routesTo === 'clinician' ? 'Clinician: argue the documented gap.' : 'Coordinator: obtain the missing evidence.'}</p>
        </li>
      ))}</ul></div> : null}
    </BlockFrame>
  );
}
