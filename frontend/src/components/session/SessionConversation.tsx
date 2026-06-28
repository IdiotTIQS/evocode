"use client";
// frontend/src/components/session/SessionConversation.tsx
// 左栏：当前 session 的消息历史（user intent / agent status / result——result 若有 runId 链 /runs/[runId]）
// + 同项目其它会话切换列表（listSessions(projectId)，链 /sessions/[id]，当前高亮）。
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";

import { listSessions } from "@/lib/stores/sessionStore";
import type { Session, SessionMessage } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<SessionMessage["role"], string> = {
  user: "你",
  agent: "Agent",
};

const KIND_LABEL: Record<SessionMessage["kind"], string> = {
  intent: "意图",
  status: "状态",
  result: "结果",
};

function MessageItem({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";
  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        isUser ? "bg-muted/50" : "bg-background"
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">
          {ROLE_LABEL[message.role]}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {KIND_LABEL[message.kind]}
        </Badge>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground">
        {message.text}
      </p>
      {message.kind === "result" && message.runId ? (
        <Link
          href={`/runs/${message.runId}`}
          className="mt-1 inline-block rounded text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          查看运行详情 →
        </Link>
      ) : null}
    </li>
  );
}

export function SessionConversation({
  projectId,
  messages,
  activeSessionId,
  className,
}: {
  projectId: string;
  messages: SessionMessage[];
  activeSessionId: string;
  className?: string;
}) {
  const [siblings, setSiblings] = useState<Session[]>([]);

  useEffect(() => {
    let active = true;
    const data = listSessions(projectId);
    if (active) setSiblings(data);
    return () => {
      active = false;
    };
    // activeSessionId 变更（如切换会话）时重新拉取，保证高亮与列表同步。
  }, [projectId, activeSessionId]);

  const sortedSiblings = [...siblings].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return (
    <aside
      className={cn("flex flex-col rounded-lg border bg-card", className)}
      aria-label="会话历史"
    >
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">消息历史</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessagesSquare
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                还没有消息，在中间输入意图开始。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {messages.map((m) => (
                <MessageItem key={m.id} message={m} />
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="px-4 py-3">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          同项目其它会话
        </h3>
        {sortedSiblings.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无其它会话。</p>
        ) : (
          <ul className="space-y-1">
            {sortedSiblings.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-primary/10 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {s.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
