import { landing } from "@/content/landing";

export function Hero() {
  const { hero } = landing;
  return (
    <section
      id="top"
      className="relative overflow-hidden pt-32 pb-24"
    >
      {/* 背景：柔和渐变光晕（火山引擎风格的浅色背景） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(0,106,255,0.08) 0%, rgba(36,178,145,0.05) 40%, rgba(255,255,255,0) 70%)",
        }}
      />
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="fade-up mb-6 inline-block rounded-full border border-[var(--color-evo-border-soft)] bg-white/60 px-4 py-1.5 text-sm text-[var(--color-evo-muted)]">
          {landing.brand.tagline}
        </p>
        <h1 className="display fade-up text-5xl text-[var(--color-evo-ink)] sm:text-6xl md:text-7xl">
          {hero.title}
        </h1>
        <p className="fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-evo-muted)]">
          {hero.subtitle}
        </p>
        <div className="fade-up mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/console"
            className="rounded-full bg-[var(--color-evo-accent)] px-7 py-3 font-medium text-white shadow-lg shadow-[var(--color-evo-accent)]/20 transition hover:bg-[var(--color-evo-accent-strong)]"
          >
            {hero.primaryCta}
          </a>
          <a
            href="#pipeline"
            className="rounded-full border border-[var(--color-evo-border-soft)] px-7 py-3 font-medium text-[var(--color-evo-ink)] transition hover:border-[var(--color-evo-accent)] hover:text-[var(--color-evo-accent)]"
          >
            {hero.secondaryCta}
          </a>
        </div>
        <p className="fade-up mt-12 font-mono text-sm tracking-tight text-[var(--color-evo-ink-soft)]">
          {hero.tagline}
        </p>
      </div>
    </section>
  );
}
