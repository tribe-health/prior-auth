import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { SourcePreviewState } from '../model/source-preview';

export function SourcePreview({
  state,
  onClose,
  onPageChange,
}: {
  state: SourcePreviewState;
  onClose: () => void;
  onPageChange: (page: number) => void;
}) {
  if (state.phase === 'closed') return null;

  const documentName = state.phase === 'ready'
    ? state.source.documentName
    : state.target.documentName;
  const effectiveDate = state.phase === 'ready'
    ? state.source.effectiveDate
    : state.target.effectiveDate;
  const pageNumber = state.phase === 'ready'
    ? state.source.pageNumber
    : state.target.pageNumber;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 motion-reduce:duration-0 sm:top-1/2 sm:left-1/2 sm:h-[min(88dvh,900px)] sm:w-[min(92vw,1100px)] sm:max-w-[min(92vw,1100px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogHeader className="border-b px-4 py-3 pr-16 sm:px-5">
          <DialogTitle>{documentName}</DialogTitle>
          <DialogDescription>
            Source date {effectiveDate} · Page {pageNumber}
          </DialogDescription>
        </DialogHeader>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-11 motion-reduce:transition-none"
          aria-label="Close source preview"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>

        <div className="flex min-h-0 flex-1 flex-col bg-ui-muted/40">
          {state.phase === 'loading' ? (
            <div role="status" className="flex flex-1 items-center justify-center gap-2 p-6 text-sm">
              <Spinner /> Opening authorized source…
            </div>
          ) : state.phase === 'ready' ? (
            <>
              <iframe
                title={`${state.source.documentName}, page ${state.source.pageNumber}`}
                src={`${state.source.objectUrl}#page=${state.source.pageNumber}`}
                className="min-h-0 w-full flex-1 border-0 bg-white"
              />
              <footer className="flex items-center justify-between gap-3 border-t bg-background px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 motion-reduce:transition-none"
                  disabled={state.source.pageNumber <= 1}
                  onClick={() => onPageChange(state.source.pageNumber - 1)}
                >
                  <ChevronLeft aria-hidden="true" /> Previous
                </Button>
                <span className="font-mono text-xs text-ui-muted-foreground" aria-live="polite">
                  Page {state.source.pageNumber} of {state.source.pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 motion-reduce:transition-none"
                  disabled={state.source.pageNumber >= state.source.pageCount}
                  onClick={() => onPageChange(state.source.pageNumber + 1)}
                >
                  Next <ChevronRight aria-hidden="true" />
                </Button>
              </footer>
            </>
          ) : (
            <div className="m-auto w-full max-w-lg p-4">
              <Alert variant="destructive" role="alert">
                <AlertTitle>{state.phase === 'refused' ? 'Source access refused' : 'Source unavailable'}</AlertTitle>
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
