import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AuthFlow, AuthFlowKind } from '@/features/authentication/model/auth-flow';
import {
  browserLogoutPendingControl,
  type LogoutControlClear,
} from '@/features/session/services/logout-pending-control';
import {
  authFlowService,
  type AuthFlowService,
} from '@/features/authentication/services/auth-flow-service';

export type AuthFlowPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'expired'
  | 'unavailable';

export interface AuthFlowModel {
  readonly phase: AuthFlowPhase;
  readonly flow: AuthFlow | null;
  readonly startUrl: string;
  readonly message: string | null;
  submit(formData: FormData): Promise<void>;
}

export function useAuthFlowModel(
  kind: AuthFlowKind,
  flowId: string | null,
  service: AuthFlowService = authFlowService,
  completeFlow: () => void = () => window.location.assign('/'),
  resolveExplicitLogin: () => LogoutControlClear = () => (
    browserLogoutPendingControl.resolveExplicitLogin()
  ),
): AuthFlowModel {
  const applicationUrl = window.location.href;
  const startUrl = useMemo(
    () => service.startUrl(kind, applicationUrl),
    [applicationUrl, kind, service],
  );
  const [phase, setPhase] = useState<AuthFlowPhase>(flowId ? 'loading' : 'idle');
  const [flow, setFlow] = useState<AuthFlow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFlow(null);
    setMessage(null);
    if (!flowId) {
      setPhase('idle');
      return () => {
        cancelled = true;
      };
    }
    setPhase('loading');
    void service.load(kind, flowId, applicationUrl).then(
      (result) => {
        if (cancelled) return;
        if (result.status === 'ready' && Date.parse(result.flow.expiresAt) > Date.now()) {
          setFlow(result.flow);
          setPhase('ready');
          return;
        }
        setPhase(result.status === 'expired' || result.status === 'ready' ? 'expired' : 'unavailable');
        setMessage(result.status === 'expired' || result.status === 'ready'
          ? 'This account access form expired. Start a new form to continue.'
          : 'The account access form could not be loaded.');
      },
      () => {
        if (cancelled) return;
        setPhase('unavailable');
        setMessage('The account access form could not be loaded.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [applicationUrl, flowId, kind, service]);

  const submit = useCallback(async (formData: FormData) => {
    if (!flow || phase === 'submitting') return;
    setPhase('submitting');
    setMessage(null);
    try {
      const result = await service.submit(flow, formData, applicationUrl);
      if (result.status === 'updated') {
        setFlow(result.flow);
        setPhase('ready');
        return;
      }
      if (result.status === 'completed') {
        if (kind === 'login' && resolveExplicitLogin() !== 'cleared') {
          setPhase('unavailable');
          setMessage('Sign-in completed, but the local sign-out control could not be cleared.');
          return;
        }
        completeFlow();
        return;
      }
      setFlow(null);
      setPhase(result.status);
      setMessage(result.status === 'expired'
        ? 'This account access form expired. Start a new form to continue.'
        : 'The account access form could not be submitted.');
    } catch {
      setPhase('unavailable');
      setMessage('The account access form could not be submitted.');
    }
  }, [applicationUrl, completeFlow, flow, kind, phase, resolveExplicitLogin, service]);

  return { phase, flow, startUrl, message, submit };
}
