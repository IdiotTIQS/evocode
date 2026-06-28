import { landing } from "@/content/landing";

export function CTA() {
  const { cta } = landing;
  return (
    <section id="cta" className="py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[var(--color-ink)] px-8 py-16 text-center sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(50% 60% at 50% 0%, rgba(0,106,255,0.35) 0%, rgba(36,178,145,0.18) 45%, rgba(12,13,14,0) 75%)",
            }}
          />
          <div className="relative">
            <h2 className="display text-4xl text-white sm:text-5xl">{cta.heading}</h2>
            <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-white/70">
              {cta.body}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <a
                href={cta.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-7 py-3 font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-accent)] hover:text-white"
              >
                {cta.button}
              </a>
              <a
                href="/console"
                className="rounded-full border border-white/30 px-7 py-3 font-medium text-white transition hover:border-white"
              >
                打开控制台
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
