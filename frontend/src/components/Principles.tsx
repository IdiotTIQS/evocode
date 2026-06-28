import { landing } from "@/content/landing";

export function Principles() {
  const { principles } = landing;
  return (
    <section id="principles" className="bg-[var(--color-evo-surface-alt)] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="display text-4xl text-[var(--color-evo-ink)] sm:text-5xl">
            {principles.heading}
          </h2>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-evo-border-soft)] bg-[var(--color-evo-border-soft)] sm:grid-cols-2 lg:grid-cols-3">
          {principles.items.map((p, i) => (
            <div key={i} className="bg-white p-7">
              <span className="font-mono text-sm text-[var(--color-evo-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-evo-muted)]">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
