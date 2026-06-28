"use client";
// frontend/src/components/session/SessionCenter.tsx
// 中栏（主交互）：当前 session 标题 + 精简意图输入（仅 Textarea + 提交）+ 提交后结果区
// （PipelineStepper + ResultTabs）。projectId/repoPath 来自 session 所属 project，不在此输入。
//
// 本任务用占位编排：提交后直接调一次 submitIntent。审批门与流式留给下个任务。
import { useState } from "react";
import { toast } from "sonner";

import { submitIntent, ControlPlaneError } from "@/lib/api";
import { appendMessage } from "@/lib/stores/sessionStore";
import type { RunResult, Session } from "@/types/domain";
import { PipelineStepper } from "@/components/console/PipelineStepper";
import { ResultTabs } from "@/components/console/ResultTabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function SessionCenter({
  session,
  projectId,
  repoPath,
  onResult,
  className,
}: {
  session: Session;
  projectId: string;
  repoPath?: string;
  onResult: (result: RunResult) => void;
  className?: string;
}) {
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const trimmed = intent.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    // 记录用户意图。
    appendMessage(session.id, { role: "user", kind: "intent", text: trimmed });
    setLoading(true);
    setResult(null);

    try {
      // TODO(T7): 接入审批门状态机替换此处直接 submitIntent
      const runResult = await submitIntent({
        intent: trimmed,
        projectId,
        ...(repoPath !== undefined ? { repoPath } : {}),
      });
      appendMessage(session.id, {
        role: "agent",
        kind: "result",
        text: `运行完成：${runResult.phase}`,
        runId: runResult.runId,
      });
      setResult(runResult);
      onResult(runResult);
      setIntent("");
    } catch (err: unknown) {
      const detail =
        err instanceof ControlPlaneError
          ? `控制平面错误 ${err.status}`
          : "无法连接控制平面";
      appendMessage(session.id, {
        role: "agent",
        kind: "status",
        text: `提交失败：${detail}`,
      });
      toast.error("意图提交失败", { description: detail });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={cn("flex min-w-0 flex-col gap-6", className)}
      aria-label="会话交互"
    >
      <div className="space-y-1">
        <h1 className="truncate text-2xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          描述你想要的改动，提交后会触发一次运行。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          aria-label="意图"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="例如：给用户表新增分页接口并补充测试"
          rows={4}
          disabled={loading}
          className="resize-y"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {loading ? "运行中…" : "提交意图"}
          </Button>
        </div>
      </form>

      {result ? (
        <div className="space-y-6">
          <PipelineStepper
            phase={result.phase}
            done={result.status === "completed"}
          />
          <ResultTabs result={result} />
        </div>
      ) : null}
    </section>
  );
}
