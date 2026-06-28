"use client";
// frontend/src/app/(workspace)/dashboard/page.tsx
// 仪表盘：顶部统计行 + 最近项目/会话/运行 + Agent 健康（流水线节点，静态诚实展示）。
// Agent 健康为七节点流水线的静态结构展示，不反映实时健康。
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderGit2,
  MessagesSquare,
  Play,
  CircleDot,
} from "lucide-react";
import { listProjects } from "@/lib/stores/projectStore";
import { listSessions } from "@/lib/stores/sessionStore";
import { listRuns } from "@/lib/api";
import type { Project, Session, RunSummary } from "@/types/domain";
import { StatCard } from "@/components/workspace/StatCard";
import { RecentList } from "@/components/workspace/RecentList";
import type { RecentListItem } from "@/components/workspace/RecentList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 七节点流水线（确定性，本地可运行）。诚实静态展示，不伪造实时健康数据。
const PIPELINE_NODES: { key: string; label: string }[] = [
  { key: "understand", label: "理解 understand" },
  { key: "plan", label: "规划 plan" },
  { key: "architect", label: "架构 architect" },
  { key: "generate", label: "生成 generate" },
  { key: "verify", label: "验证 verify" },
  { key: "review", label: "评审 review" },
  { key: "apply", label: "应用 apply" },
];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsError, setRunsError] = useState(false);

  useEffect(() => {
    let active = true;
    // Project / Session 现为真实后端 API，可能失败（后端未启动），容错处理。
    listProjects()
      .then((p) => {
        if (active) setProjects(p);
      })
      .catch(() => {
        if (active) setProjects([]);
      });
    listSessions()
      .then((s) => {
        if (active) setSessions(s);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    listRuns(8)
      .then((r) => {
        if (active) {
          setRuns(r);
          setRunsError(false);
        }
      })
      .catch(() => {
        if (active) setRunsError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const recentProjects: RecentListItem[] = [...projects]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      primary: p.name,
      ...(p.repoPath !== undefined ? { secondary: p.repoPath } : {}),
      href: `/projects/${p.id}`,
    }));

  const recentSessions: RecentListItem[] = [...sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      primary: s.title,
      secondary: fmtTime(s.updatedAt),
      href: `/sessions/${s.id}`,
    }));

  const recentRuns: RecentListItem[] = runs.slice(0, 5).map((r) => ({
    id: r.runId,
    primary: r.intent,
    secondary: `${r.phase} · ${fmtTime(r.createdAt)}`,
    href: `/runs/${r.runId}`,
  }));

  const hasProjects = projects.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          最近的项目、会话与运行，以及流水线节点概览。
        </p>
      </div>

      {!hasProjects ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            还没有项目，去{" "}
            <Link
              href="/projects"
              className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              项目
            </Link>{" "}
            页创建一个。
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="项目" value={projects.length} icon={FolderGit2} />
        <StatCard label="会话" value={sessions.length} icon={MessagesSquare} />
        <StatCard
          label="最近运行"
          value={runsError ? "—" : runs.length}
          icon={Play}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentList
          title="最近项目"
          icon={FolderGit2}
          items={recentProjects}
          emptyHint="还没有项目。去项目页创建一个。"
        />
        <RecentList
          title="最近会话"
          icon={MessagesSquare}
          items={recentSessions}
          emptyHint="还没有会话。"
        />
        <RecentList
          title="最近运行"
          icon={Play}
          items={recentRuns}
          emptyHint={
            runsError
              ? "无法加载运行，请确认控制平面已启动。"
              : "还没有运行记录。"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleDot className="size-4" aria-hidden="true" /> Agent 健康
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE_NODES.map((node, i) => (
              <li
                key={node.key}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate">{node.label}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            流水线节点（确定性，本地可运行）。此处为静态结构展示，不反映实时健康状态。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
