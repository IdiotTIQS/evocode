import { landing } from "@/content/landing";

export function SiteFooter() {
  const { footer, brand } = landing;
  return (
    <footer className="border-t border-[var(--color-evo-border-soft)] bg-white py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-[var(--color-evo-accent)] to-[var(--color-evo-teal)]" />
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        </div>
        <ul className="flex flex-wrap gap-6">
          {footer.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-sm text-[var(--color-evo-muted)] transition-colors hover:text-[var(--color-evo-accent)]"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-6 text-sm text-[var(--color-evo-muted)]">
        {footer.note}
      </p>
    </footer>
  );
}
