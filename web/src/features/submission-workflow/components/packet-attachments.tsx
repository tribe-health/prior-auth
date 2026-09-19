import { FileCheck2, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PacketAttachment } from '../model/submission-workflow';

export function PacketAttachments({ attachments }: { readonly attachments: readonly PacketAttachment[] }) {
  return <Card className="workflow-card min-w-0">
    <CardHeader className="gap-3"><div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><CardTitle>Attachment manifest</CardTitle><Badge variant="outline">{attachments.length} {attachments.length === 1 ? 'item' : 'items'}</Badge></div><CardDescription>The ordered documents returned for this packet.</CardDescription></CardHeader>
    <CardContent>
      {attachments.length === 0 ? <p className="text-sm leading-6 text-ui-muted-foreground">No packet attachments are available yet.</p> : <ol className="grid min-w-0 divide-y divide-border">
        {attachments.map((attachment) => <li key={attachment.ordinal} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          {attachment.documentId === null ? <FileCheck2 className="mt-0.5 size-4 text-ui-muted-foreground" aria-hidden="true" /> : <FileText className="mt-0.5 size-4 text-ui-muted-foreground" aria-hidden="true" />}
          <div className="min-w-0 [overflow-wrap:anywhere]"><p className="text-sm font-medium leading-6">{attachment.name}</p><p className="mt-1 font-mono text-xs text-ui-muted-foreground">Item {attachment.ordinal} · {attachment.kind.replaceAll('_', ' ')}</p></div>
          <p className="col-start-2 text-xs leading-6 text-ui-muted-foreground sm:col-start-auto">{attachment.pageCount === null ? 'Page count unavailable' : `${attachment.pageCount} ${attachment.pageCount === 1 ? 'page' : 'pages'}`}</p>
        </li>)}
      </ol>}
    </CardContent>
  </Card>;
}
