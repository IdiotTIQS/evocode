"use client";
// frontend/src/components/session/SessionConversation.tsx
// 左栏：会话切换器——同项目的会话列表（listSessions(projectId)，当前高亮，链 /sessions/[id]）
// + 新建会话。对话本身已移至中栏聊天流，故此处不再重复消息历史。
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare, Plus } from "lucide-react";

import { listSessions, createSession } from "@/lib/stores/sessionStore";
import type { Session } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function SessionConversation({
  projectId,
  activeSessionId,
  className,
}: {
  projectId: string;
  activeSessionId: string;
  className?: string;
}) {
  const router = useRouter();
  const [siblings, setSiblings] = useState<Session[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    let active = true;
    listSessions(projectId)
      .then((data) => {
        if (active) setSiblings(data);
      })
      .catch(() => {
        if (active) setSiblings([]);
      });
    return () => {
      active = false;
    };
    // activeSessionId 变更（如切换会话）时重新拉取，保证高亮与列表同步。
  }, [projectId, activeSessionId]);

  const sortedSiblings = [...siblings].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t.length === 0) return;
    try {
      const s = await createSession(projectId, t);
      router.push(`/sessions/${s.id}`);
    } catch {
      /* 容错：失败不打断 */
    }
  }

  return (
    <aside
      className={cn("flex flex-col rounded-lg border bg-card", className)}
      aria-label="会话列表"
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">会话</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="新建会话"
          onClick={() => setCreating((v) => !v)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {creating ? (
        <form onSubmit={handleCreate} className="flex gap-2 border-b p-3">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="新会话标题"
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={title.trim().length === 0}>
            建
          </Button>
        </form>
      ) : null}

      <ScrollArea className="flex-1">
        <div className="p-2">
          {sortedSiblings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessagesSquare
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                还没有其它会话。
              </p>
            </div>
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
                        "block truncate rounded-md px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      </ScrollArea>
    </aside>
  );
}
