"use client";
// frontend/src/components/session/SessionCenter.tsx
// 中栏（主交互）：当前 session 标题 + 意图输入 + 审批门状态机驱动的执行流。
//
// 本任务用 useExecution 替换 Task 6 的直接 submitIntent：
//   提交意图 → planning →【真实暂停】plan gate（后端在 generate 前中断，磁盘零写入）
//   批准计划 → coding（resume 生成 changeSet）→ diff gate（仍未落盘）
//   批准 diff → reviewing（resume 落盘）→ completed（渲染 ResultTabs）。
// PipelineStepper 通过 mapStateToStepper 把 ExecutionState 映射到现有 phase
// 字符串（不改 PipelineStepper，保持 Run 详情页复用）。
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useExecution } from "@/lib/execution/useExecution";
import { mapStateToStepper } from "@/lib/execution/executionMachine";
import { appendMessage } from "@/lib/stores/sessionStore";
import type { RunResult, Session } from "@/types/domain";
import { PipelineStepper } from "@/components/console/PipelineStepper";
import { ResultTabs } from "@/components/console/ResultTabs";
import { ApprovalGate } from "@/components/session/ApprovalGate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// 会话消息为「记录」语义，对主流程非关键路径：fire-and-forget，吞掉网络错误避免
// 未处理 rejection（消息落库失败不应打断意图/审批操作）。
function logMessage(
  sessionId: string,
  msg: Parameters<typeof appendMessage>[1]
): void {
  void appendMessage(sessionId, msg).catch(() => {});
}

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
  const exec = useExecution({
    projectId,
    ...(repoPath !== undefined ? { repoPath } : {}),
  });

  // 防止 completed 时重复回调/记录。
  const completedRunRef = useRef<string | null>(null);

  const trimmed = intent.trim();
  const isIdle = exec.state === "queued" || exec.state === "failed";
  const isRunning =
    exec.state === "planning" ||
    exec.state === "coding" ||
    exec.state === "testing" ||
    exec.state === "reviewing";
  const canSubmit = trimmed.length > 0 && isIdle;

  // completed：记录消息 + 回传结果（仅一次）。
  useEffect(() => {
    if (
      exec.state === "completed" &&
      exec.result &&
      completedRunRef.current !== exec.result.runId
    ) {
      completedRunRef.current = exec.result.runId;
      logMessage(session.id, {
        role: "agent",
        kind: "result",
        text: `运行完成：${exec.result.phase}`,
        runId: exec.result.runId,
      });
      onResult(exec.result);
    }
  }, [exec.state, exec.result, session.id, onResult]);

  // failed：提示并记录。
  useEffect(() => {
    if (exec.state === "failed" && exec.error) {
      logMessage(session.id, {
        role: "agent",
        kind: "status",
        text: `提交失败：${exec.error}`,
      });
      toast.error("意图执行失败", { description: exec.error });
    }
  }, [exec.state, exec.error, session.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    completedRunRef.current = null;
    logMessage(session.id, { role: "user", kind: "intent", text: trimmed });
    exec.submitIntent(trimmed);
  }

  function handleApprovePlan() {
    logMessage(session.id, {
      role: "user",
      kind: "status",
      text: "已批准计划，开始生成代码",
    });
    exec.approvePlan();
  }

  function handleApproveDiff() {
    logMessage(session.id, {
      role: "user",
      kind: "status",
      text: "已批准变更并应用",
    });
    exec.approveDiff();
  }

  function handleReject() {
    logMessage(session.id, {
      role: "user",
      kind: "status",
      text: exec.gate === "diff" ? "已拒绝变更" : "已拒绝计划",
    });
    exec.reject();
  }

  const stepper = mapStateToStepper(exec.state, exec.gate);
  const showPipeline = exec.state !== "queued" && exec.state !== "failed";

  return (
    <section
      className={cn("flex min-w-0 flex-col gap-6", className)}
      aria-label="会话交互"
    >
      <div className="space-y-1">
        <h1 className="truncate text-2xl font-semibold">{session.title}</h1>
        <p className="text-sm text-muted-foreground">
          描述你想要的改动。提交后会先生成计划，批准后才会执行代码生成。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          aria-label="意图"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="例如：给用户表新增分页接口并补充测试"
          rows={4}
          disabled={!isIdle}
          className="resize-y"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {isRunning || exec.state === "waiting_approval"
              ? "进行中…"
              : "提交意图"}
          </Button>
        </div>
      </form>

      {showPipeline ? (
        <div className="space-y-6">
          <PipelineStepper phase={stepper.phase} done={stepper.done} />

          {/* 阶段文案（请求在途时显示，由真实后端往返驱动）。 */}
          {exec.phaseLabel ? (
            <p
              className="text-sm text-muted-foreground motion-safe:animate-pulse"
              aria-live="polite"
            >
              {exec.phaseLabel}
            </p>
          ) : null}

          {/* 审批门：waiting_approval 时按 gate 渲染计划/diff 审批面板。 */}
          {exec.state === "waiting_approval" && exec.gate ? (
            <ApprovalGate
              gate={exec.gate}
              {...(exec.plan !== undefined ? { plan: exec.plan } : {})}
              {...(exec.result !== undefined ? { result: exec.result } : {})}
              onApprove={
                exec.gate === "plan" ? handleApprovePlan : handleApproveDiff
              }
              onReject={handleReject}
            />
          ) : null}

          {/* completed：完整结果。 */}
          {exec.state === "completed" && exec.result ? (
            <ResultTabs result={exec.result} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
