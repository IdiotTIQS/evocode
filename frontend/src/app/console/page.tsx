"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { IntentForm } from "@/components/console/IntentForm";
import { PipelineStepper } from "@/components/console/PipelineStepper";
import { ResultTabs } from "@/components/console/ResultTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { submitIntent, ControlPlaneError } from "@/lib/api";
import type { RunResult } from "@/types/intent";

export default function ConsolePage() {
  const [intent, setIntent] = useState("");
  const [projectId, setProjectId] = useState("demo");
  const [repoPath, setRepoPath] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    try {
      const r = await submitIntent({
        intent,
        projectId,
        repoPath: repoPath || undefined,
      });
      setResult(r);
    } catch (err) {
      if (err instanceof ControlPlaneError) {
        toast.error(`控制平面返回错误（HTTP ${err.status}），请检查意图内容或服务端日志。`);
      } else {
        toast.error(
          "无法连接控制平面，请确认服务已启动（control-plane:8080 与 ai-runtime:8000）。"
        );
      }
      console.error("submitIntent failed", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">运行意图</h2>
        <p className="text-sm text-muted-foreground">
          描述一个意图，流水线会依次理解、规划、架构、生成、验证、审查，一次跑完。
        </p>
      </div>

      <IntentForm
        value={intent}
        projectId={projectId}
        repoPath={repoPath}
        onIntentChange={setIntent}
        onProjectIdChange={setProjectId}
        onRepoPathChange={setRepoPath}
        onSubmit={onSubmit}
        loading={loading}
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : result ? (
        <div className="space-y-6">
          <PipelineStepper phase={result.phase} done={result.status === "completed"} />
          <ResultTabs result={result} />
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">提交一个意图，开始一次运行</p>
              <p className="text-sm text-muted-foreground">
                在上面填写意图并点击运行，这里会展示阶段进度和结果。
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
