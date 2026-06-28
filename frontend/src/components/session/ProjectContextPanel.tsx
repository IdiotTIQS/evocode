"use client";
// frontend/src/components/session/ProjectContextPanel.tsx
// 右栏：项目上下文（项目名 / repoPath / createdAt；latestResult 若有 graphStats 显示文件/组件/import 数）
// + 「本会话运行历史」（listRuns(sessionId)，latestResult 变化时刷新，链 /runs/[id]）。
import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderGit2, Play } from "lucide-react";

import type { Project, RunResult, RunSummary } from "@/types/domain";
import { listRuns } from "@/lib/api";
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
  sessionId,
  className,
}: {
  project: Project | null;
  latestResult: RunResult | null;
  sessionId?: string;
  className?: string;
}) {
  const stats = latestResult?.graphStats;

  // 本会话运行历史：挂载时加载，latestResult（新 run 完成）变化时刷新。
  const [runs, setRuns] = useState<RunSummary[]>([]);
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    listRuns(20, sessionId)
      .then((data) => {
        if (active) setRuns(data);
      })
      .catch(() => {
        if (active) setRuns([]);
      });
    return () => {
      active = false;
    };
    // 依赖稳定派生值而非 latestResult 对象引用：仅在新 run（runId 变）或状态迁移时刷新，
    // 避免 SSE 每个节点事件都触发一次 listRuns。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, latestResult?.runId, latestResult?.status]);

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
          本会话运行历史
        </h3>
        {runs.length > 0 ? (
          <ul className="space-y-1.5">
            {runs.map((r) => (
              <li key={r.runId}>
                <Link
                  href={`/runs/${r.runId}`}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs outline-none transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Play className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium">{r.intent}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {r.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              本会话还没有运行记录。提交意图并批准后将出现在这里。
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
