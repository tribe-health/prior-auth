import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccessState, useSessionActions } from '@/app/providers/session-provider';

export function AccessStateNotice() {
  const { accessState, draftNotice, logoutState, notice } = useAccessState();
  const { retryLogout } = useSessionActions();
  const title = accessState === 'signed-out' ? 'Signed out' : 'Access locked';

  return (
    <main className="grid min-h-dvh place-items-center bg-ui-muted/30 p-4 sm:p-8">
      <Card className="w-full max-w-md" role={accessState === 'locally-locked' ? 'alert' : 'status'}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-ui-muted-foreground">
            {notice ?? 'Sign in to continue.'}
          </p>
          {draftNotice ? <p className="text-sm text-ui-muted-foreground">{draftNotice}</p> : null}
          {logoutState === 'failed' ? (
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto sm:self-start"
              onClick={() => void retryLogout()}
            >
              Retry server sign-out
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
