"use client";
// frontend/src/components/session/SessionCenter.tsx
// 中栏（主交互）：多轮对话式编码工作区。
//
// 这是一个【聊天流】：历史消息以气泡呈现（user/agent），当前轮的流水线进度 / 审批门 /
// 结果作为对话流里的内联卡片；底部输入框【随时可追问】，不再一次性锁死。
//
// 多轮上下文：提交意图时携带本会话已有消息（history）与最近一次运行的 changeSet
// （priorChangeSet）——后端据此让 LLM 接续对话并在已有文件基础上迭代修改。
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CornerDownLeft, Loader2 } from "lucide-react";

import { useExecution } from "@/lib/execution/useExecution";
import { mapStateToStepper } from "@/lib/execution/executionMachine";
import { appendMessage } from "@/lib/stores/sessionStore";
import type { RunResult, Session, SessionMessage } from "@/types/domain";
import type { ConversationTurn } from "@/types/intent";
import { PipelineStepper } from "@/components/console/PipelineStepper";
import { ResultTabs } from "@/components/console/ResultTabs";
import { ApprovalGate } from "@/components/session/ApprovalGate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// 会话消息为「记录」语义，fire-and-forget，吞掉网络错误避免未处理 rejection。
function logMessage(
  sessionId: string,
  msg: Parameters<typeof appendMessage>[1]
): void {
  void appendMessage(sessionId, msg).catch(() => {});
}

function ChatBubble({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground"
        )}
      >
        {!isUser ? (
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {message.kind === "result" ? "结果" : "EvoCode"}
          </span>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
      </div>
    </div>
  );
}

export function SessionCenter({
  session,
  projectId,
  repoPath,
  messages,
  latestResult,
  onResult,
  className,
}: {
  session: Session;
  projectId: string;
  repoPath?: string;
  messages: SessionMessage[];
  latestResult: RunResult | null;
  onResult: (result: RunResult) => void;
  className?: string;
}) {
  const [intent, setIntent] = useState("");
  const exec = useExecution({
    projectId,
    sessionId: session.id,
    ...(repoPath !== undefined ? { repoPath } : {}),
  });

  const completedRunRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const trimmed = intent.trim();
  const isIdle = exec.state === "queued" || exec.state === "failed";
  const isRunning =
    exec.state === "planning" ||
    exec.state === "coding" ||
    exec.state === "testing" ||
    exec.state === "reviewing";
  const isBusy = isRunning || exec.state === "waiting_approval";
  const canSubmit = trimmed.length > 0 && isIdle;

  // 多轮上下文：把已落库的消息转成对话历史；最近一次 run 的 changeSet 作为迭代基线。
  const history: ConversationTurn[] = useMemo(
    () => messages.map((m) => ({ role: m.role, text: m.text })),
    [messages]
  );
  const priorChangeSet = useMemo(
    () => latestResult?.changeSet ?? [],
    [latestResult]
  );

  // 新消息 / 进度变化时滚到底部。
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, exec.state, exec.phaseLabel]);

  // completed：记录消息 + 回传结果（仅一次）。
  useEffect(() => {
    if (
      exec.state === "completed" &&
      exec.result &&
      completedRunRef.current !== exec.result.runId
    ) {
      completedRunRef.current = exec.result.runId;
      const r = exec.result;
      const applied = r.appliedFiles?.length ?? 0;
      logMessage(session.id, {
        role: "agent",
        kind: "result",
        text: `已完成：生成 ${r.changeSet?.length ?? 0} 个文件${
          applied ? `，应用 ${applied} 个` : ""
        }。可继续追问以迭代修改。`,
        runId: r.runId,
      });
      onResult(r);
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
    // 带上多轮上下文（已有对话 + 上一轮生成的文件）。
    exec.submitIntent(trimmed, { history, priorChangeSet });
    setIntent("");
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
  const isFirstTurn = messages.length === 0;

  return (
    <section
      className={cn("flex min-w-0 flex-col", className)}
      aria-label="会话交互"
    >
      <div className="mb-3 space-y-0.5">
        <h1 className="truncate text-xl font-semibold">{session.title}</h1>
        <p className="text-xs text-muted-foreground">
          多轮对话式编码：描述需求 → 审批计划 → 审批变更落盘。可在结果上继续追问迭代。
        </p>
      </div>

      {/* 对话流 */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto rounded-lg border bg-card/40 p-4"
      >
        {isFirstTurn && exec.state === "queued" ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">开始对话</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              例如「做一个联系表单页面，含姓名和邮箱」。生成后可继续说「再加个手机号字段」来迭代。
            </p>
          </div>
        ) : null}

        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}

        {/* 当前轮的进度 / 审批门 / 结果——作为 agent 侧的内联卡片 */}
        {showPipeline ? (
          <div className="flex justify-start">
            <div className="w-full max-w-[95%] space-y-4 rounded-2xl rounded-bl-sm border bg-background p-4">
              <PipelineStepper phase={stepper.phase} done={stepper.done} />

              {exec.phaseLabel ? (
                <p
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  {exec.phaseLabel}
                </p>
              ) : null}

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

              {exec.state === "completed" && exec.result ? (
                <ResultTabs result={exec.result} />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* 输入框：随时可追问（仅在途时禁用，避免并发提交） */}
      <form onSubmit={handleSubmit} className="mt-3 space-y-2">
        <div className="relative">
          <Textarea
            aria-label="消息"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={
              isFirstTurn
                ? "描述你想要的改动…"
                : "继续追问以迭代，例如：再加一个手机号字段"
            }
            rows={3}
            disabled={isBusy}
            className="resize-y pr-28"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            className="absolute bottom-2 right-2"
          >
            {isBusy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                进行中
              </>
            ) : (
              <>
                发送
                <CornerDownLeft className="size-3.5" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          ⌘/Ctrl + Enter 发送。{isBusy ? "当前轮进行中，完成或处理审批后可继续。" : ""}
        </p>
      </form>
    </section>
  );
}
