import { ArrowLeft, Check, FileCheck2, ShieldCheck } from 'lucide-react';
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
import { BrandMark } from '@/shared/ui/brand-mark';

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
    <main className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(22rem,.82fr)_minmax(30rem,1.18fr)]">
      <section className="relative isolate hidden overflow-hidden bg-[#14181C] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14" aria-label="About the workbench">
        <div className="absolute inset-0 -z-10 opacity-70" aria-hidden="true">
          <svg viewBox="0 0 700 1000" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
            <path d="M-190 750 C 50 455, 330 390, 840 445 L 840 610 C 360 535, 45 620, -190 905 Z" fill="#DF7C35" opacity=".85" />
            <path d="M-190 820 C 90 585, 410 530, 820 590 L 820 654 C 400 600, 60 700, -190 940 Z" fill="#8FB9D0" opacity=".24" />
          </svg>
        </div>
        <Link to="/welcome" aria-label="Advanced Spine & Orthopedics home" className="self-start rounded-sm bg-white px-4 py-3">
          <BrandMark className="w-48" />
        </Link>
        <div className="max-w-xl">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-[#A7C5D6]">Prior authorization workbench</p>
          <h2 className="mt-5 font-display text-5xl font-semibold leading-[1.02] tracking-[-0.035em]">One accountable path from chart to letter.</h2>
          <p className="mt-5 max-w-lg text-base leading-7 text-[#C7CDD2]">The workbench keeps evidence, policy, clinical authority, and the final cited request connected in one case record.</p>
          <ul className="mt-8 grid gap-3 text-sm text-[#E5E9EC]">
            <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><Check className="size-4 text-[#F0955A]" aria-hidden="true" /></span>Met, gap, and void remain distinct.</li>
            <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><ShieldCheck className="size-4 text-[#F0955A]" aria-hidden="true" /></span>A surgeon confirms the clinical decision.</li>
            <li className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-white/10"><FileCheck2 className="size-4 text-[#F0955A]" aria-hidden="true" /></span>Every included assertion carries a source.</li>
          </ul>
        </div>
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-[#9CA6AD]">Synthetic demonstration data · Southlake, Texas</p>
      </section>

      <section className="flex min-h-dvh flex-col bg-surface lg:bg-canvas">
        <header className="flex h-18 items-center justify-between border-b border-chrome px-4 sm:px-8 lg:border-0 lg:px-12">
          <Link to="/welcome" className="lg:hidden" aria-label="Advanced Spine & Orthopedics home"><BrandMark className="w-40" /></Link>
          <Link to="/welcome" className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-text">
            <ArrowLeft className="size-4" aria-hidden="true" /> About the workbench
          </Link>
        </header>
        <div className="grid flex-1 place-items-center px-4 py-10 sm:px-8 lg:px-12">
          <Card className="w-full max-w-[30rem] border-chrome bg-canvas shadow-[0_1.2rem_3rem_rgba(35,31,32,.07)]">
            <CardHeader className="gap-3 px-6 pt-7 sm:px-8 sm:pt-9">
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-accent">Secure practice access</p>
              <CardTitle><h1 className="font-display text-3xl font-semibold tracking-[-0.025em]">{title}</h1></CardTitle>
              <CardDescription className="text-sm leading-6">{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-6 pb-7 sm:px-8 sm:pb-9">
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

          <nav className="grid grid-cols-1 gap-2 border-t border-chrome pt-4 sm:grid-cols-2" aria-label="Account access">
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
        </div>
        <footer className="px-6 py-5 text-center font-mono text-[0.6rem] uppercase tracking-[0.1em] text-subtle">
          Advanced Spine &amp; Orthopedics · Protected practice workspace
        </footer>
      </section>
    </main>
  );
}
