// frontend/src/lib/stores/sessionStore.ts
// Session / SessionMessage 数据源适配器。已对接控制平面真实端点（跨设备持久化）。
// 所有函数为 async：调用方需 await。错误沿用 api.ts 的 ControlPlaneError。
import type { Session, SessionMessage } from "@/types/domain";
import { ControlPlaneError } from "@/lib/api";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

interface SessionDto {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// 当前 SessionDto 无可空字段，映射为直通；保留此函数与 projectStore.fromDto 对称，
// 未来 Session 新增可选字段时在此统一做 null→undefined 归一化，避免遗漏。
function sessionFromDto(d: SessionDto): Session {
  return { ...d };
}

interface SessionMessageDto {
  id: string;
  sessionId: string;
  role: "user" | "agent";
  kind: "intent" | "status" | "result";
  text: string;
  runId: string | null;
  createdAt: string;
}

function msgFromDto(d: SessionMessageDto): SessionMessage {
  return {
    id: d.id,
    sessionId: d.sessionId,
    role: d.role,
    kind: d.kind,
    text: d.text,
    ...(d.runId ? { runId: d.runId } : {}),
    createdAt: d.createdAt,
  };
}

export async function listSessions(projectId?: string): Promise<Session[]> {
  const qs = projectId !== undefined
    ? `?projectId=${encodeURIComponent(projectId)}`
    : "";
  const resp = await fetch(`${BASE}/api/sessions${qs}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  const data: SessionDto[] = await resp.json();
  return data.map(sessionFromDto);
}

/** 未找到返回 null（404）。 */
export async function getSession(id: string): Promise<Session | null> {
  const resp = await fetch(`${BASE}/api/sessions/${encodeURIComponent(id)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return sessionFromDto(await resp.json());
}

export async function createSession(
  projectId: string,
  title: string
): Promise<Session> {
  const resp = await fetch(`${BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, title }),
  });
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

/**
 * 追加消息（服务端生成 id/createdAt，并刷新 session.updatedAt）。
 * 返回写入后的完整消息。
 */
export async function appendMessage(
  sessionId: string,
  msg: Omit<SessionMessage, "id" | "sessionId" | "createdAt">
): Promise<SessionMessage> {
  const resp = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    }
  );
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return msgFromDto(await resp.json());
}

export async function getMessages(sessionId: string): Promise<SessionMessage[]> {
  const resp = await fetch(
    `${BASE}/api/sessions/${encodeURIComponent(sessionId)}/messages`
  );
  if (resp.status === 404) return [];
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  const data: SessionMessageDto[] = await resp.json();
  return data.map(msgFromDto);
}
