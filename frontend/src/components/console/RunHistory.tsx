"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { listRuns } from "@/lib/api";
import type { RunSummary } from "@/types/intent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RunHistory({ onSelect, refreshKey }: { onSelect: (runId: string) => void; refreshKey: number }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listRuns(20)
      .then((r) => { if (active) { setRuns(r); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden="true" /> 运行历史
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-sm text-muted-foreground">无法加载历史，请确认控制平面已启动。</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有运行记录。提交一个意图后会出现在这里。</p>
        ) : (
          runs.map((r) => (
            <button
              key={r.runId}
              onClick={() => onSelect(r.runId)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate">{r.intent}</span>
              <Badge variant={r.status === "completed" ? "default" : "destructive"}>{r.phase}</Badge>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
