import { landing } from "@/content/landing";

export function Pipeline() {
  const { pipeline } = landing;
  return (
    <section id="pipeline" className="bg-[var(--color-evo-surface-alt)] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="display text-4xl text-[var(--color-evo-ink)] sm:text-5xl">
            {pipeline.heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--color-evo-muted)]">
            {pipeline.subheading}
          </p>
        </div>

        {/* 流水线步骤：编号 + 标题 + 描述，桌面三列、移动单列 */}
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pipeline.steps.map((step, i) => (
            <li
              key={step.key}
              className="group relative rounded-2xl border border-[var(--color-evo-border-soft)] bg-white p-6 transition hover:border-[var(--color-evo-accent)] hover:shadow-lg hover:shadow-[var(--color-evo-ink)]/5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-evo-ink)] font-mono text-sm text-white transition group-hover:bg-[var(--color-evo-accent)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-lg font-semibold">
                  {step.title}
                  <span className="ml-2 font-mono text-xs font-normal text-[var(--color-evo-muted)]">
                    {step.key}
                  </span>
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-evo-muted)]">
                {step.desc}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-center font-mono text-sm text-[var(--color-evo-ink-soft)]">
          understand → plan → architect → generate → verify → review
        </p>
      </div>
    </section>
  );
}
