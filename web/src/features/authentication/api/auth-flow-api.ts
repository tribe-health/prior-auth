import { httpClient, type HttpExchange } from '@/shared/api/http-client';
import type { AuthFlowKind } from '@/features/authentication/model/auth-flow';

function flowBase(kind: AuthFlowKind): string {
  return `/self-service/${kind}`;
}

export function browserFlowStartUrl(kind: AuthFlowKind, applicationUrl: string): string {
  const returnTo = new URL('/', applicationUrl).toString();
  return `${flowBase(kind)}/browser?return_to=${encodeURIComponent(returnTo)}`;
}

export const authFlowApi = {
  get: (kind: AuthFlowKind, flowId: string): Promise<HttpExchange<unknown>> =>
    httpClient.exchange<unknown>(`${flowBase(kind)}/flows?id=${encodeURIComponent(flowId)}`),
  submit: (action: string, body: Readonly<Record<string, string | readonly string[]>>) =>
    httpClient.exchange<unknown>(action, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
