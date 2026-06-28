"use client";
// frontend/src/app/(workspace)/projects/[projectId]/runs/page.tsx
// 运行：listRuns()（真实后端 API，try/catch 容错）后按 projectId 过滤，链 /runs/[id]。空态。
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Play } from "lucide-react";
import { listRuns } from "@/lib/api";
import type { RunSummary } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  return "secondary";
}

export default function RunsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listRuns()
      .then((data) => {
        if (!active) return;
        setRuns(data.filter((r) => r.projectId === projectId));
        setError(false);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  return (
    <div className="space-y-6">
      {error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Play className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              无法加载运行记录，请确认控制平面已启动。
            </p>
          </CardContent>
        </Card>
      ) : loaded && runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Play className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              该项目还没有运行记录。
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => (
            <li key={r.runId}>
              <Link
                href={`/runs/${r.runId}`}
                className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="py-4 transition-colors hover:border-ring">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">
                        {r.intent}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.phase} · {fmtTime(r.createdAt)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
