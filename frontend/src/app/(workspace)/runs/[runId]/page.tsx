"use client";
// frontend/src/app/(workspace)/runs/[runId]/page.tsx
// Run 详情独立路由：按 runId 拉 getRun，渲染 PipelineStepper + ResultTabs。
// 把原本挤在 /console 的"结果区"提成独立可分享 URL（刷新保留）。三态：loading / notfound / failed。
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { getRun, ControlPlaneError } from "@/lib/api";
import type { RunResult } from "@/types/intent";
import { ResultTabs } from "@/components/console/ResultTabs";
import { PipelineStepper } from "@/components/console/PipelineStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type RunError = "notfound" | "failed" | null;

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RunError>(null);
  // retryKey 变更会重新触发 effect，实现"重试"。
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResult(null);
    getRun(runId)
      .then((r) => {
        if (!active) return;
        setResult(r);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof ControlPlaneError && e.status === 404) {
          setError("notfound");
        } else {
          setError("failed");
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [runId, retryKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error === "notfound") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>运行不存在</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              找不到运行{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                {runId}
              </code>
              ，它可能已被删除，或链接有误。
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard">返回仪表盘</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error === "failed") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>无法加载运行</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>无法加载运行，请确认控制平面已启动。</p>
            <div className="flex items-center gap-3">
              <Button onClick={() => setRetryKey((k) => k + 1)}>重试</Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">返回仪表盘</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">运行详情</h1>
          <Badge variant={result.status === "completed" ? "default" : "destructive"}>
            {result.status}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
            {result.runId}
          </code>
          <span>·</span>
          <span>{result.phase}</span>
        </div>
      </div>

      <PipelineStepper
        phase={result.phase}
        done={result.status === "completed"}
      />

      <ResultTabs result={result} />
    </div>
  );
}
