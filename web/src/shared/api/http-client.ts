// The ONLY place in the web app that calls fetch.
//
// Components import feature hooks; hooks call a feature api module; a feature
// api module calls this. A component that reaches for fetch has skipped two
// layers, and scripts/audit.sh fails the build when one does.

import { publishSessionRevocation } from '@/shared/session-revocation-events';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = message,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 403 on a clinical act is a real answer, not a bug. Surface the reason. */
  get isCapabilityDenied() {
    return this.status === 403;
  }

  /** 409 means an upstream precondition is unmet — the gate, usually. */
  get isPreconditionUnmet() {
    return this.status === 409;
  }

  /** The command may have committed before an upstream timeout or failure. */
  get isCommitOutcomeUncertain() {
    return this.status === 408 || this.status >= 500;
  }
}

function observeAccessFailure(status: number, code: string): void {
  if (status === 401) {
    publishSessionRevocation('Your session has ended. Sign in again.');
  } else if (status === 403 && code === 'reauthentication_required') {
    publishSessionRevocation('Sign in again to verify your session.');
  } else if (status === 403 && code === 'practice_denied') {
    publishSessionRevocation('Your access to this practice has ended. Sign in again.');
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const code = body.error ?? res.statusText;
    observeAccessFailure(res.status, code);
    throw new ApiError(res.status, code, code);
  }
  return (await res.json()) as T;
}

async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body,
    credentials: 'include',
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    const response = (await res.json().catch(() => ({}))) as { error?: string };
    const code = response.error ?? res.statusText;
    observeAccessFailure(res.status, code);
    throw new ApiError(res.status, code, code);
  }
  return (await res.json()) as T;
}

async function requestEmpty(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const code = body.error ?? res.statusText;
    observeAccessFailure(res.status, code);
    throw new ApiError(res.status, code, code);
  }
}

export interface HttpBlobResponse {
  readonly body: Blob;
  readonly headers: Headers;
  readonly status: number;
}

async function requestBlob(path: string, init?: RequestInit): Promise<HttpBlobResponse> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers: { accept: 'application/octet-stream', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const code = body.error ?? res.statusText;
    observeAccessFailure(res.status, code);
    throw new ApiError(res.status, code, code);
  }

  return {
    body: await res.blob(),
    headers: res.headers,
    status: res.status,
  };
}

export interface HttpExchange<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly body: T | null;
  readonly redirectedTo: string | null;
}

async function exchange<T>(path: string, init?: RequestInit): Promise<HttpExchange<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: T | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
  }
  return {
    status: res.status,
    ok: res.ok,
    body,
    redirectedTo: res.redirected ? res.url : null,
  };
}

export const httpClient = {
  stream: async (path: string, init: RequestInit): Promise<Response> => {
    const response = await fetch(`${BASE}${path}`, {
      ...init, credentials: 'include', cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...init.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
      const code = body.error ?? body.code ?? response.statusText;
      observeAccessFailure(response.status, code);
      throw new ApiError(response.status, code, code);
    }
    if (!response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) {
      throw new ApiError(502, 'The document task stream is unavailable.', 'invalid_task_stream');
    }
    return response;
  },
  get: <T>(path: string) => request<T>(path),
  getBlob: (path: string, init?: RequestInit) => requestBlob(path, init),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) => requestForm<T>(path, body),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  exchange: <T>(path: string, init?: RequestInit) => exchange<T>(path, init),
  deleteEmpty: (path: string) => requestEmpty(path, { method: 'DELETE' }),
};
