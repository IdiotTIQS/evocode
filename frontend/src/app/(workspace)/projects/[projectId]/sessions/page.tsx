"use client";
// frontend/src/app/(workspace)/projects/[projectId]/sessions/page.tsx
// 会话：该项目会话列表（链 /sessions/[id]）+ 内联"新建会话"。空态。
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MessagesSquare, Plus } from "lucide-react";
import { listSessions, createSession } from "@/lib/stores/sessionStore";
import type { Session } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function SessionsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const router = useRouter();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    let active = true;
    listSessions(projectId)
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const session = await createSession(projectId, trimmed);
    router.push(`/sessions/${session.id}`);
  }

  const sorted = [...sessions].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="session-title">新建会话</Label>
              <Input
                id="session-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="会话标题"
              />
            </div>
            <Button type="submit" disabled={!canSubmit}>
              <Plus className="size-4" aria-hidden="true" />
              创建会话
            </Button>
          </form>
        </CardContent>
      </Card>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <MessagesSquare
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              还没有会话，在上方创建一个开始对话。
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {sorted.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="py-4 transition-colors hover:border-ring">
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {s.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtTime(s.updatedAt)}
                    </span>
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
