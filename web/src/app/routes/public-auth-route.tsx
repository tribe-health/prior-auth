import { Link, useSearchParams } from 'react-router';

import { useAccessState, useRuntimePhase } from '@/app/providers/session-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthFlowForm } from '@/features/authentication/components/auth-flow-form';

export function PublicAuthRoute({ mode }: { mode: 'login' | 'recovery' }) {
  const [searchParams] = useSearchParams();
  const runtimePhase = useRuntimePhase();
  const { accessState, draftNotice, logoutPending, logoutState, notice } = useAccessState();
  const unavailable = runtimePhase === 'session-unavailable';
  const logoutLocked = accessState === 'locally-locked' && logoutState === 'failed';
  const title = mode === 'login' ? 'Sign in' : 'Recover access';
  const description = mode === 'login'
    ? 'Use your practice account to open the prior authorization workbench.'
    : 'Start account recovery for your practice account.';

  return (
    <main className="grid min-h-dvh place-items-center bg-ui-muted/30 p-4 sm:p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-ui-muted-foreground">
            Advanced Spine &amp; Orthopedics
          </p>
          <CardTitle><h1>{title}</h1></CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {logoutLocked ? (
            <Alert>
              <AlertTitle>
                {logoutPending ? 'Server sign-out pending' : 'Logout control unavailable'}
              </AlertTitle>
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : unavailable ? (
            <Alert>
              <AlertTitle>Sign-in service unavailable</AlertTitle>
              <AlertDescription>
                The application could not check your current session. Sign-in and recovery remain
                available without opening patient data.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-ui-muted-foreground" role="status">
              No active session was found.
            </p>
          )}

          {draftNotice ? (
            <Alert>
              <AlertTitle>Unsent draft retained in memory</AlertTitle>
              <AlertDescription>{draftNotice}</AlertDescription>
            </Alert>
          ) : null}

          <AuthFlowForm kind={mode} flowId={searchParams.get('flow')} />

          <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Account access">
            <Link
              className={buttonVariants({ variant: mode === 'login' ? 'default' : 'outline' })}
              to="/login"
              aria-current={mode === 'login' ? 'page' : undefined}
            >
              Sign in
            </Link>
            <Link
              className={buttonVariants({ variant: mode === 'recovery' ? 'default' : 'outline' })}
              to="/recovery"
              aria-current={mode === 'recovery' ? 'page' : undefined}
            >
              Recover access
            </Link>
          </nav>
        </CardContent>
      </Card>
    </main>
  );
}
