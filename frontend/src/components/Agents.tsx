import { landing } from "@/content/landing";

export function Agents() {
  const { agents } = landing;
  return (
    <section id="agents" className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="display text-4xl text-[var(--color-ink)] sm:text-5xl">
            {agents.heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted)]">
            {agents.subheading}
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.items.map((agent) => {
            const built = agent.status === "built";
            return (
              <div
                key={agent.name}
                className="rounded-2xl border border-[var(--color-border-soft)] bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--color-ink)]/5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{agent.name}</h3>
                  <span
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                      (built
                        ? "bg-[var(--color-teal)]/12 text-[var(--color-teal)]"
                        : "bg-[var(--color-muted)]/12 text-[var(--color-muted)]")
                    }
                  >
                    {built ? "已构建" : "计划中"}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
                  {agent.role}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
