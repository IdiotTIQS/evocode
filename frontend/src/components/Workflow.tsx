import { landing } from "@/content/landing";

export function Workflow() {
  const { workflow } = landing;
  return (
    <section id="vision" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="display text-center text-4xl text-[var(--color-evo-ink)] sm:text-5xl">
          {workflow.heading}
        </h2>
        <div className="mt-14 grid gap-6 md:grid-cols-4">
          {workflow.steps.map((s, i) => (
            <div key={i} className="relative">
              <div className="font-mono text-3xl font-light text-[var(--color-evo-accent)]/40">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-evo-muted)]">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
