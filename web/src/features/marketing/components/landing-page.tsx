import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileCheck2,
  FileSearch,
  Fingerprint,
  Quote,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import { BrandMark } from '@/shared/ui/brand-mark';
import { cn } from '@/lib/utils';

const workflow = [
  { index: '01', title: 'Assemble the chart', copy: 'Collect the required records and show every missing disclosure before policy review begins.', icon: FileSearch },
  { index: '02', title: 'Compare with policy', copy: 'Keep met, gap, and void separate so the right person receives the right next action.', icon: ClipboardCheck },
  { index: '03', title: 'Confirm the decision', copy: 'A surgeon affirms policy, section, pathway, and operative plan before any prose exists.', icon: ShieldCheck },
  { index: '04', title: 'Generate the letter', copy: 'Build one coherent draft with document, page, date, and quote attached to every assertion.', icon: FileCheck2 },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas text-text">
      <header className="sticky top-0 z-40 border-b border-chrome/80 bg-canvas/92 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[90rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link to="/welcome" aria-label="Advanced Spine & Orthopedics home">
            <BrandMark className="w-40 sm:w-48" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex" aria-label="Public navigation">
            <a href="#workflow" className="transition-colors hover:text-text">Workflow</a>
            <a href="#controls" className="transition-colors hover:text-text">Clinical controls</a>
            <a href="#purpose" className="transition-colors hover:text-text">Why it exists</a>
          </nav>
          <Link className={buttonVariants({ className: 'min-h-11 bg-accent-vivid px-5 text-white hover:bg-accent-hover' })} to="/login">
            Open workbench <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-[#14181C] text-white">
          <div className="absolute inset-0 -z-10 opacity-70" aria-hidden="true">
            <svg viewBox="0 0 1440 760" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
              <path className="landing-sweep landing-sweep-primary" d="M-120 590 C 240 270, 740 180, 1560 280 L 1560 405 C 760 290, 250 390, -120 710 Z" fill="#DF7C35" />
              <path className="landing-sweep landing-sweep-secondary" d="M-80 650 C 330 390, 850 330, 1530 400 L 1530 454 C 850 395, 330 485, -80 735 Z" fill="#A7C5D6" opacity=".28" />
            </svg>
          </div>
          <div className="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-[90rem] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(23rem,.72fr)] lg:px-10 lg:py-24">
            <div className="max-w-4xl">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-[#A7C5D6]">Surgery authorization workbench</p>
              <h1 className="mt-6 max-w-[13ch] font-display text-[clamp(3.2rem,7vw,6.8rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-balance">
                The chart makes the case. The letter shows its work.
              </h1>
              <p className="mt-7 max-w-[63ch] text-base leading-7 text-[#C7CDD2] sm:text-lg sm:leading-8">
                Assemble the record, compare it with the controlling policy, route every gap to the person who can resolve it, and generate a cited request only after the clinical decision is confirmed.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link className={buttonVariants({ className: 'min-h-12 bg-accent-vivid px-6 text-white hover:bg-accent-hover' })} to="/login">
                  Sign in to the demo <ArrowRight aria-hidden="true" />
                </Link>
                <a className={buttonVariants({ variant: 'outline', className: 'min-h-12 border-white/25 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white' })} href="#workflow">
                  See the case path
                </a>
              </div>
            </div>

            <aside className="self-end rounded-lg bg-white/[0.08] p-5 backdrop-blur-sm sm:p-6" aria-label="Drafting gate summary">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-[#A7C5D6]">Drafting gate</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold">Four facts before prose.</h2>
                </div>
                <Fingerprint className="size-8 text-[#F0955A]" aria-hidden="true" />
              </div>
              <ol className="mt-6 grid gap-3 text-sm text-[#D9DEE2]">
                {['Controlling payer policy', 'Governing policy section', 'Authorization pathway', 'Prospective operative plan'].map((item) => (
                  <li key={item} className="flex items-center gap-3 rounded-md bg-black/15 px-3 py-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#E7F3EC] text-[#1E6F4E]"><Check className="size-3.5" aria-hidden="true" /></span>
                    {item}
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,.65fr)_minmax(0,1.35fr)]">
            <header className="max-w-xl">
              <p className="font-mono text-eyebrow uppercase tracking-[0.2em] text-subtle">One case · one accountable path</p>
              <h2 className="mt-4 font-display text-[clamp(2.25rem,4.2vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.035em]">From surgical decision to a defensible request.</h2>
              <p className="mt-5 text-base leading-7 text-muted">The interface keeps the current case, deadline, evidence state, and next responsible person visible. It does not hide uncertainty behind a draft.</p>
            </header>
            <ol className="grid gap-px overflow-hidden rounded-lg bg-chrome sm:grid-cols-2">
              {workflow.map(({ index, title, copy, icon: Icon }) => (
                <li key={index} className="group bg-surface p-6 transition-colors hover:bg-raised sm:p-7">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-xs text-accent">{index}</span>
                    <Icon className="size-5 text-cool" aria-hidden="true" />
                  </div>
                  <h3 className="mt-10 font-display text-2xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="controls" className="bg-raised">
          <div className="mx-auto grid max-w-[90rem] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-10 lg:py-28">
            <div>
              <p className="font-mono text-eyebrow uppercase tracking-[0.2em] text-subtle">Three evidence states</p>
              <h2 className="mt-4 max-w-[13ch] font-display text-[clamp(2.2rem,4vw,4rem)] font-semibold leading-[1.04] tracking-[-0.03em]">Missing and insufficient are different work.</h2>
            </div>
            <div className="grid gap-3">
              <EvidenceState label="Met" detail="The chart supports the policy requirement and keeps the source attached." tone="met" />
              <EvidenceState label="Gap" detail="The chart says no. A surgeon must explain the clinical position." tone="gap" />
              <EvidenceState label="Void" detail="The chart is silent. A coordinator must obtain the missing record." tone="void" />
            </div>
          </div>
        </section>

        <section id="purpose" className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-10 lg:py-28">
          <div className="grid gap-10 rounded-lg bg-cool-surface p-6 sm:p-10 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <Quote className="size-10 text-cool" aria-hidden="true" />
            <div>
              <p className="font-display text-2xl font-semibold leading-snug text-cool sm:text-3xl">“This assertion has no source document. It will not be included.”</p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-cool/80">The product says exactly what is missing and what that changes. Source fidelity is part of the clinical workflow, not a footnote added after generation.</p>
            </div>
            <Link className={buttonVariants({ variant: 'outline', className: 'min-h-11 border-cool/25 bg-canvas text-cool hover:bg-white' })} to="/login">Open the demo</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-chrome bg-surface">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-10">
          <div><BrandMark className="w-44" /><p className="mt-3 max-w-md text-sm text-muted">Prior authorization evidence and letter workflow for Advanced Spine &amp; Orthopedics.</p></div>
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-subtle">Synthetic demonstration data · Southlake, Texas</div>
        </div>
      </footer>
    </div>
  );
}

function EvidenceState({ label, detail, tone }: { label: string; detail: string; tone: 'met' | 'gap' | 'void' }) {
  const style = {
    met: 'bg-status-met-surface text-status-met',
    gap: 'bg-status-gap-surface text-status-gap',
    void: 'bg-status-void-surface text-status-void',
  }[tone];
  return (
    <div className={cn('grid gap-2 rounded-lg p-5 sm:grid-cols-[8rem_1fr] sm:items-baseline', style)}>
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em]"><span className={cn('size-2 bg-current', tone === 'met' ? 'rounded-full' : tone === 'void' ? 'rotate-45 rounded-[1px]' : 'rounded-[1px]')} aria-hidden="true" />{label}</div>
      <p className="text-sm leading-6 text-muted">{detail}</p>
    </div>
  );
}
