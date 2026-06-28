import { Menu } from "lucide-react";

import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <ConsoleSidebar className="hidden md:flex w-60 shrink-0 border-r border-border" />
      <div className="flex-1 overflow-y-auto">
        <header className="flex h-14 items-center gap-3 border-b border-border px-6">
          <button
            type="button"
            aria-label="打开菜单"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu className="size-4" />
          </button>
          <h1 className="text-sm font-medium">控制台</h1>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
