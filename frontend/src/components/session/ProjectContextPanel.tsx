"use client";
// frontend/src/components/session/ProjectContextPanel.tsx
// 右栏：项目上下文（项目名 / repoPath / createdAt；latestResult 若有 graphStats 显示文件/组件/import 数）
// + "Agent 活动"占位区（诚实标"计划中（backend SSE 落地后接入）"）。
import { FolderGit2 } from "lucide-react";

import type { Project, RunResult } from "@/types/domain";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words text-sm text-foreground">{value}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function ProjectContextPanel({
  project,
  latestResult,
  className,
}: {
  project: Project | null;
  latestResult: RunResult | null;
  className?: string;
}) {
  const stats = latestResult?.graphStats;

  return (
    <aside
      className={cn("flex flex-col rounded-lg border bg-card", className)}
      aria-label="项目上下文"
    >
      <div className="border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <FolderGit2 className="size-4" aria-hidden="true" />
          项目上下文
        </h2>
      </div>

      <div className="space-y-4 px-4 py-3">
        {project ? (
          <>
            <Field label="项目名" value={project.name} />
            <Field
              label="仓库路径 repoPath"
              value={
                project.repoPath ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {project.repoPath}
                  </code>
                ) : (
                  <span className="text-muted-foreground">未设置</span>
                )
              }
            />
            <Field label="创建时间 createdAt" value={fmtTime(project.createdAt)} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">项目信息不可用。</p>
        )}
      </div>

      {stats ? (
        <>
          <Separator />
          <div className="space-y-2 px-4 py-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              最近运行图统计 graphStats
            </h3>
            <StatRow label="文件数 fileCount" value={stats.fileCount} />
            <StatRow label="组件数 componentCount" value={stats.componentCount} />
            <StatRow label="导入数 importCount" value={stats.importCount} />
          </div>
        </>
      ) : null}

      <Separator />

      <div className="px-4 py-3">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          Agent 活动
        </h3>
        {/* 诚实占位：实时活动流尚未接入，等待 backend SSE。 */}
        <div className="rounded-md border border-dashed px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            活动流：计划中（backend SSE 落地后接入）
          </p>
        </div>
      </div>
    </aside>
  );
}
