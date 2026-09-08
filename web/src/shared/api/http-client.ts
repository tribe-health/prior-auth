// The ONLY place in the web app that calls fetch.
//
// Components import feature hooks; hooks call a feature api module; a feature
// api module calls this. A component that reaches for fetch has skipped two
// layers, and scripts/audit.sh fails the build when one does.

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export const httpClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
};
