"use client";
// frontend/src/app/(workspace)/projects/[projectId]/overview/page.tsx
// 概览：项目元信息（名称/仓库路径/创建时间）+ 会话数、运行数计数。
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MessagesSquare, Play } from "lucide-react";
import { getProject } from "@/lib/stores/projectStore";
import { listSessions } from "@/lib/stores/sessionStore";
import { listRuns } from "@/lib/api";
import type { Project } from "@/types/domain";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function OverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<Project | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [runCount, setRunCount] = useState<number | null>(null);
  const [runsError, setRunsError] = useState(false);

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then((p) => {
        if (active) setProject(p);
      })
      .catch(() => {
        if (active) setProject(null);
      });
    listSessions(projectId)
      .then((s) => {
        if (active) setSessionCount(s.length);
      })
      .catch(() => {
        if (active) setSessionCount(0);
      });
    listRuns()
      .then((runs) => {
        if (!active) return;
        setRunCount(runs.filter((r) => r.projectId === projectId).length);
        setRunsError(false);
      })
      .catch(() => {
        if (active) setRunsError(true);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">项目信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">名称</dt>
              <dd className="text-sm">{project ? project.name : "—"}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">仓库路径</dt>
              <dd className="truncate text-sm">
                {project?.repoPath ? project.repoPath : "未设置"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">创建时间</dt>
              <dd className="text-sm">
                {project ? fmtTime(project.createdAt) : "—"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">项目 ID</dt>
              <dd className="truncate font-mono text-xs">{projectId}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-3">
            <MessagesSquare
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {sessionCount}
              </p>
              <p className="text-xs text-muted-foreground">会话</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3">
            <Play className="size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {runsError ? "—" : (runCount ?? "…")}
              </p>
              <p className="text-xs text-muted-foreground">
                运行{runsError ? "（控制平面未连接）" : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
