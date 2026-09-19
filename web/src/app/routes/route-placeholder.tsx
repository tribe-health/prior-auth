import { CheckCircle2, CircleDashed, LockKeyhole } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RoutePlaceholderProps {
  action: string;
  description: string;
  eyebrow: string;
  items: readonly string[];
  note: string;
  title: string;
}

export function RoutePlaceholder({ action, description, eyebrow, items, note, title }: RoutePlaceholderProps) {
  // <section>, not <main>: AppShell already renders the <main> landmark and
  // nesting them is an a11y violation. Observed in the accessibility tree
  // 2026-09-06 as main > main.
  return (
    <section className="workflow-surface min-h-full bg-canvas px-4 py-6 text-text sm:px-7 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="max-w-3xl">
          <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-balance">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{description}</p>
        </header>
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
          <Card className="workflow-card">
            <CardHeader className="flex-row items-center justify-between gap-4">
              <CardTitle>Current record</CardTitle>
              <Badge variant="outline">Demo preview</Badge>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-px overflow-hidden rounded-lg border border-chrome bg-chrome">
                {items.map((item, index) => (
                  <li key={item} className="flex min-h-14 items-center gap-3 bg-surface px-4 py-3">
                    {index === 0 ? <CheckCircle2 className="size-5 shrink-0 text-status-met" aria-hidden="true" /> : <CircleDashed className="size-5 shrink-0 text-cool" aria-hidden="true" />}
                    <span className="text-sm leading-5">{item}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card className="workflow-card bg-raised">
            <CardHeader><CardTitle>Controlled next action</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              <p className="text-sm leading-6 text-muted">{note}</p>
              <Button disabled className="min-h-11 w-full"><LockKeyhole aria-hidden="true" />{action}</Button>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-subtle">Available when the required committed state exists</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
