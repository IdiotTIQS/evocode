"use client";
// frontend/src/app/(workspace)/projects/[projectId]/layout.tsx
// 项目级外壳：顶部项目名 + Tabs 导航（next/link + usePathname active 高亮）。
// 不存在的项目显示提示 + 返回链。children 渲染各 tab 页。
// 注：单一 main 由 (workspace) layout 提供，此处用 div 包裹。
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getProject } from "@/lib/stores/projectStore";
import type { Project } from "@/types/domain";

const TABS: { key: string; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "sessions", label: "会话" },
  { key: "runs", label: "运行" },
  { key: "graph", label: "知识图谱" },
  { key: "settings", label: "设置" },
];

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const pathname = usePathname();

  // hydrated 区分"还没拉取"和"确实不存在"，避免加载期误报。
  const [project, setProject] = useState<Project | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((p) => {
        if (active) {
          setProject(p);
          setHydrated(true);
        }
      })
      .catch(() => {
        if (active) {
          setProject(null);
          setHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (hydrated && project === null) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">项目不存在</h1>
        <p className="text-sm text-muted-foreground">
          找不到该项目，可能已被删除。
        </p>
        <Link
          href="/projects"
          className="inline-block rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          返回项目列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {project ? project.name : " "}
        </h1>
        {project?.repoPath ? (
          <p className="truncate text-sm text-muted-foreground">
            {project.repoPath}
          </p>
        ) : null}
      </div>

      <nav
        aria-label="项目导航"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map((tab) => {
          const href = `/projects/${projectId}/${tab.key}`;
          const active = pathname === href;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-t-md border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
