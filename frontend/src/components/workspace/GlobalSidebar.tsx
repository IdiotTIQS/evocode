"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderGit2, Settings, ArrowLeft, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderGit2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

const navLinkClass =
  "inline-flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function GlobalSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside
      className={cn(
        "flex flex-col gap-4 bg-background p-4 md:gap-6",
        className
      )}
    >
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-2 outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-success" />
        <span className="text-base font-semibold tracking-tight">EvoCode</span>
      </Link>

      <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                navLinkClass,
                active && "bg-secondary text-primary hover:bg-secondary hover:text-primary"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 md:mt-auto">
        {user ? (
          <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={user.email}>
                {user.email}
              </p>
              <p className="text-muted-foreground">{user.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="登出"
              title="登出"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : null}
        <Link href="/" className={navLinkClass}>
          <ArrowLeft className="size-4" />
          返回首页
        </Link>
      </div>
    </aside>
  );
}
