"use client";
// frontend/src/app/(workspace)/sessions/[sessionId]/page.tsx
// Session Workspace 三栏布局：左会话历史 / 中央交互 / 右项目上下文。
// useParams 取 sessionId → getSession（不存在→友好提示+回 /projects）→ getProject(session.projectId)。
// 中栏提交后回传 result：刷新左栏消息列表 + 更新右栏 graphStats。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  getSession,
  getMessages,
} from "@/lib/stores/sessionStore";
import { getProject } from "@/lib/stores/projectStore";
import type { Project, RunResult, Session, SessionMessage } from "@/types/domain";
import { SessionConversation } from "@/components/session/SessionConversation";
import { SessionCenter } from "@/components/session/SessionCenter";
import { ProjectContextPanel } from "@/components/session/ProjectContextPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type LoadState = "loading" | "ready" | "notfound";

export default function SessionWorkspacePage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [latestResult, setLatestResult] = useState<RunResult | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    setLatestResult(null);

    const found = getSession(sessionId);
    if (!found) {
      if (active) {
        setSession(null);
        setProject(null);
        setMessages([]);
        setState("notfound");
      }
      return () => {
        active = false;
      };
    }

    const proj = getProject(found.projectId);
    const msgs = getMessages(sessionId);
    if (active) {
      setSession(found);
      setProject(proj);
      setMessages(msgs);
      setState("ready");
    }
    return () => {
      active = false;
    };
  }, [sessionId]);

  // 中栏提交后：刷新消息列表（左栏）+ 记录最新结果（右栏 graphStats）。
  const handleResult = useCallback(
    (result: RunResult) => {
      setLatestResult(result);
      setMessages(getMessages(sessionId));
    },
    [sessionId]
  );

  if (state === "loading") {
    return (
      <div className="flex gap-4">
        <Skeleton className="hidden h-[70vh] w-64 shrink-0 lg:block" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="hidden h-[70vh] w-72 shrink-0 xl:block" />
      </div>
    );
  }

  if (state === "notfound" || !session) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>会话不存在</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              找不到会话{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                {sessionId}
              </code>
              ，它可能已被删除，或链接有误。
            </p>
            <Button asChild variant="outline">
              <Link href="/projects">返回项目</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <SessionConversation
        className="hidden w-64 shrink-0 lg:flex lg:max-h-[calc(100vh-8rem)]"
        projectId={session.projectId}
        messages={messages}
        activeSessionId={session.id}
      />
      <SessionCenter
        className="flex-1 min-w-0"
        session={session}
        projectId={session.projectId}
        {...(project?.repoPath !== undefined
          ? { repoPath: project.repoPath }
          : {})}
        onResult={handleResult}
      />
      <ProjectContextPanel
        className="hidden w-72 shrink-0 xl:flex"
        project={project}
        latestResult={latestResult}
      />
    </div>
  );
}
