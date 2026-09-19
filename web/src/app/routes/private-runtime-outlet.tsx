import { Outlet } from 'react-router';

import { useRuntimePhase } from '@/app/providers/session-provider';
import { ShellLoading } from '@/app/shell/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PrivateRuntimeOutlet() {
  const runtimePhase = useRuntimePhase();

  if (runtimePhase === 'ready') return <Outlet />;

  if (runtimePhase === 'offline-limited' || runtimePhase === 'recovery-required') {
    const recoveryRequired = runtimePhase === 'recovery-required';
    return (
      <main className="grid min-h-dvh place-items-center bg-ui-muted/30 p-4 sm:p-8">
        <Card className="w-full max-w-md" role="alert">
          <CardHeader>
            <CardTitle>
              {recoveryRequired ? 'Local data needs recovery' : 'Patient data unavailable'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ui-muted-foreground">
              {recoveryRequired
                ? 'The local database could not be prepared. Protected case screens remain closed.'
                : 'Required case data has not finished synchronizing. Protected case screens remain closed.'}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <ShellLoading />;
}
