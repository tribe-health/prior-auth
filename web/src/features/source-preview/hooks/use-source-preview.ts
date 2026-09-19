import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useRequiredSession, useSessionEpoch } from '@/app/providers/session-provider';
import { ApiError } from '@/shared/api/http-client';
import { sameViewScope, viewScope, type ViewScope } from '@/shared/scoped-view-store';
import { useScopedViewStore } from '@/shared/use-scoped-view-store';
import { sourcePreviewApi, type SourcePreviewService } from '../api/source-preview-api';
import type {
  RenderedSource,
  SourcePreviewState,
  SourcePreviewTarget,
} from '../model/source-preview';

interface PreviewSelection {
  readonly selectedCitationId: string | null;
}

interface ScopedPreviewState {
  readonly scope: ViewScope;
  readonly state: SourcePreviewState;
}

const CLOSED: SourcePreviewState = Object.freeze({ phase: 'closed' });

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

function citationId(state: SourcePreviewState): string | null {
  if (state.phase === 'closed') return null;
  return state.phase === 'ready' ? state.source.citationId : state.target.id;
}

function refusal(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.status === 401 || cause.status === 403);
}

export function useSourcePreview(
  caseId: string,
  service: SourcePreviewService = sourcePreviewApi,
) {
  const session = useRequiredSession();
  const epoch = useSessionEpoch();
  const viewInstanceId = useId();
  const scope = useMemo(
    () => viewScope(session, epoch, caseId, viewInstanceId),
    [caseId, epoch, session, viewInstanceId],
  );
  const [selection, lease] = useScopedViewStore<PreviewSelection>(scope, () => ({
    selectedCitationId: null,
  }));
  const [scopedState, setScopedState] = useState<ScopedPreviewState>({
    scope: lease.scope,
    state: CLOSED,
  });
  const requestRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const targetRef = useRef<SourcePreviewTarget | null>(null);

  const releaseObjectUrl = useCallback(() => {
    const url = objectUrlRef.current;
    objectUrlRef.current = null;
    if (url) URL.revokeObjectURL(url);
  }, []);

  const close = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    targetRef.current = null;
    releaseObjectUrl();
    lease.publish(() => ({ selectedCitationId: null }));
    setScopedState({ scope: lease.scope, state: CLOSED });
  }, [lease, releaseObjectUrl]);

  const open = useCallback(async (target: SourcePreviewTarget): Promise<void> => {
    requestRef.current?.abort();
    releaseObjectUrl();
    targetRef.current = target;
    const request = new AbortController();
    requestRef.current = request;
    const abortForScope = () => request.abort();
    lease.signal.addEventListener('abort', abortForScope, { once: true });
    lease.publish(() => ({ selectedCitationId: target.id }));
    setScopedState({ scope: lease.scope, state: { phase: 'loading', target } });

    try {
      const result = await lease.execute(
        () => service.open(target, session.practiceId, epoch, request.signal),
      );
      if (result.status === 'stale' || request.signal.aborted || requestRef.current !== request) return;
      const objectUrl = URL.createObjectURL(result.value.blob);
      if (!lease.isCurrent() || request.signal.aborted || requestRef.current !== request) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      objectUrlRef.current = objectUrl;
      const source: RenderedSource = {
        citationId: target.id,
        documentId: result.value.documentId,
        documentName: result.value.documentName,
        effectiveDate: result.value.effectiveDate,
        pageNumber: result.value.pageNumber,
        pageCount: result.value.pageCount,
        mediaType: result.value.mediaType,
        objectUrl,
      };
      setScopedState({ scope: lease.scope, state: { phase: 'ready', source } });
    } catch (cause) {
      if (request.signal.aborted || isAbort(cause) || !lease.isCurrent()) return;
      setScopedState({
        scope: lease.scope,
        state: {
          phase: refusal(cause) ? 'refused' : 'unavailable',
          target,
          message: refusal(cause)
            ? 'You do not have access to this source document.'
            : 'The source document could not be opened. Try again.',
        },
      });
    } finally {
      lease.signal.removeEventListener('abort', abortForScope);
      if (requestRef.current === request) requestRef.current = null;
    }
  }, [epoch, lease, releaseObjectUrl, service, session.practiceId]);

  const goToPage = useCallback((pageNumber: number) => {
    const target = targetRef.current;
    if (!target || !Number.isInteger(pageNumber) || pageNumber < 1) return Promise.resolve();
    return open({ ...target, pageNumber });
  }, [open]);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
    targetRef.current = null;
    releaseObjectUrl();
  }, [lease, releaseObjectUrl]);

  const current = sameViewScope(scopedState.scope, lease.scope)
    && citationId(scopedState.state) === selection.selectedCitationId
    ? scopedState.state
    : CLOSED;

  return {
    state: current,
    selectedCitationId: selection.selectedCitationId,
    open,
    close,
    goToPage,
  } as const;
}
