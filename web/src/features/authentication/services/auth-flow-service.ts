import {
  authFlowApi,
  browserFlowStartUrl,
} from '@/features/authentication/api/auth-flow-api';
import {
  parseAuthFlow,
  type AuthFlow,
  type AuthFlowKind,
} from '@/features/authentication/model/auth-flow';

export type AuthFlowLoadResult =
  | { readonly status: 'ready'; readonly flow: AuthFlow }
  | { readonly status: 'expired' }
  | { readonly status: 'unavailable' };

export type AuthFlowSubmitResult =
  | { readonly status: 'updated'; readonly flow: AuthFlow }
  | { readonly status: 'completed' }
  | { readonly status: 'expired' }
  | { readonly status: 'unavailable' };

function formBody(formData: FormData): Readonly<Record<string, string | readonly string[]>> {
  const body: Record<string, string | string[]> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    const current = body[name];
    if (current === undefined) {
      body[name] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      body[name] = [current, value];
    }
  }
  return body;
}

export interface AuthFlowService {
  startUrl(kind: AuthFlowKind, applicationUrl: string): string;
  load(kind: AuthFlowKind, flowId: string, applicationUrl: string): Promise<AuthFlowLoadResult>;
  submit(flow: AuthFlow, formData: FormData, applicationUrl: string): Promise<AuthFlowSubmitResult>;
}

export const authFlowService: AuthFlowService = {
  startUrl: browserFlowStartUrl,
  async load(kind, flowId, applicationUrl) {
    const response = await authFlowApi.get(kind, flowId);
    if (response.status === 404 || response.status === 410) return { status: 'expired' };
    const flow = parseAuthFlow(response.body, kind, flowId, applicationUrl);
    return flow ? { status: 'ready', flow } : { status: 'unavailable' };
  },
  async submit(flow, formData, applicationUrl) {
    if (Date.parse(flow.expiresAt) <= Date.now()) return { status: 'expired' };
    const response = await authFlowApi.submit(flow.action, formBody(formData));
    if (response.status === 404 || response.status === 410) return { status: 'expired' };
    const updated = parseAuthFlow(response.body, flow.kind, flow.id, applicationUrl);
    if (updated) return { status: 'updated', flow: updated };
    return response.ok || response.redirectedTo
      ? { status: 'completed' }
      : { status: 'unavailable' };
  },
};
