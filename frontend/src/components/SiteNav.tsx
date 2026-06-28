import { landing } from "@/content/landing";

export function SiteNav() {
  return (
    <header className="glass fixed inset-x-0 top-0 z-50 border-b border-[var(--color-border-soft)]/60">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-teal)]" />
          <span className="text-lg font-semibold tracking-tight">{landing.brand.name}</span>
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {landing.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="text-sm text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-accent)]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="/console"
          className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent)]"
        >
          打开控制台
        </a>
      </nav>
    </header>
  );
}
