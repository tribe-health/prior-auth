import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { parseDocumentSurface, type DocumentPresentationState } from '../model/document-surfaces';
import {
  ClaimsManifestBlock,
  DraftPreviewBlock,
  HaltMemoBlock,
  QaFindingsBlock,
  type SourceOpenHandler,
} from './document-blocks';

/** Transport-independent adapter: callers supply data and host-owned intent handlers. */
export function DocumentSurfaceRenderer({ descriptor, presentation, onOpenSource }: {
  readonly descriptor: unknown;
  readonly presentation?: DocumentPresentationState;
  readonly onOpenSource?: SourceOpenHandler;
}) {
  const parsed = parseDocumentSurface(descriptor);
  if (parsed.status === 'refused') {
    return (
      <Alert variant="destructive" className="min-w-0 [overflow-wrap:anywhere]">
        <AlertTitle>Generated block unavailable</AlertTitle>
        <AlertDescription>{parsed.message}</AlertDescription>
      </Alert>
    );
  }

  switch (parsed.descriptor.surface) {
    case 'DraftPreviewBlock':
      return <DraftPreviewBlock data={parsed.descriptor.props} presentation={presentation} />;
    case 'QaFindingsBlock':
      return <QaFindingsBlock data={parsed.descriptor.props} presentation={presentation} />;
    case 'ClaimsManifestBlock':
      return <ClaimsManifestBlock data={parsed.descriptor.props} presentation={presentation} onOpenSource={onOpenSource} />;
    case 'HaltMemoBlock':
      return <HaltMemoBlock data={parsed.descriptor.props} presentation={presentation} />;
  }
}
