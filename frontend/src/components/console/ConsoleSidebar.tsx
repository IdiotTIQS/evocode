import { Terminal, GitBranch, Bot, Settings, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
};

const navItems: NavItem[] = [
  { label: "控制台", href: "/console", icon: Terminal, active: true },
  { label: "流水线", href: "#", icon: GitBranch },
  { label: "智能体", href: "#", icon: Bot },
  { label: "设置", href: "#", icon: Settings },
];

const navLinkClass =
  "inline-flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function ConsoleSidebar({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-4 bg-background p-4 md:gap-6",
        className
      )}
    >
      <div className="flex items-center gap-2.5 px-2">
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-success" />
        <span className="text-base font-semibold tracking-tight">EvoCode</span>
      </div>

      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {navItems.map(({ label, href, icon: Icon, active }) => (
          <a
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(navLinkClass, active && "bg-secondary text-primary hover:bg-secondary hover:text-primary")}
          >
            <Icon className="size-4" />
            {label}
          </a>
        ))}
      </nav>

      <div className="md:mt-auto">
        <a href="/" className={navLinkClass}>
          <ArrowLeft className="size-4" />
          返回首页
        </a>
      </div>
    </aside>
  );
}
