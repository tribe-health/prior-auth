interface RoutePlaceholderProps {
  description: string;
  title: string;
}

export function RoutePlaceholder({ description, title }: RoutePlaceholderProps) {
  // <section>, not <main>: AppShell already renders the <main> landmark and
  // nesting them is an a11y violation. Observed in the accessibility tree
  // 2026-09-06 as main > main.
  return (
    <section className="bg-canvas px-s5 py-s7 text-text sm:px-s7">
      <div className="mx-auto max-w-3xl">
        <p className="text-eyebrow font-bold uppercase tracking-[0.16em] text-accent">
          Prior Authorization Workbench
        </p>
        <h1 className="mt-s3 font-display text-display">{title}</h1>
        <p className="mt-s4 max-w-2xl text-body text-muted">{description}</p>
      </div>
    </section>
  );
}
