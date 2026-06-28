// frontend/src/lib/stores/sessionStore.ts
// Session / SessionMessage 本地数据源适配器（seam）。当前用 localStorage 持久化，
// 接口与未来后端对齐。诚实隔离：这不是真实后端。
import type { Session, SessionMessage } from "@/types/domain";
import { getItem, setItem, newId } from "./storage";

const SESSIONS_KEY = "evocode.sessions";
const MESSAGES_KEY = "evocode.messages";

function readSessions(): Session[] {
  return getItem<Session[]>(SESSIONS_KEY, []);
}

function writeSessions(sessions: Session[]): void {
  setItem(SESSIONS_KEY, sessions);
}

function readMessages(): SessionMessage[] {
  return getItem<SessionMessage[]>(MESSAGES_KEY, []);
}

function writeMessages(messages: SessionMessage[]): void {
  setItem(MESSAGES_KEY, messages);
}

// TODO(backend): 后端 Session API 落地后替换为 fetch(`/api/sessions?projectId=...`)。
export function listSessions(projectId?: string): Session[] {
  const sessions = readSessions();
  return projectId === undefined
    ? sessions
    : sessions.filter((s) => s.projectId === projectId);
}

// TODO(backend): 后端 Session API 落地后替换为 fetch(`/api/sessions/${id}`)。
export function getSession(id: string): Session | null {
  return readSessions().find((s) => s.id === id) ?? null;
}

// TODO(backend): 后端 Session API 落地后替换为 fetch(`/api/sessions`, { method: "POST" })。
export function createSession(projectId: string, title: string): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id: newId(),
    projectId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  const sessions = readSessions();
  sessions.push(session);
  writeSessions(sessions);
  return session;
}

// TODO(backend): 后端落地后此更新随消息写入合并到 POST 消息接口。
export function touchSession(id: string): void {
  const sessions = readSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx === -1) return;
  sessions[idx] = { ...sessions[idx]!, updatedAt: new Date().toISOString() };
  writeSessions(sessions);
}

// TODO(backend): 后端 Message API 落地后替换为 fetch(`/api/sessions/${sessionId}/messages`, { method: "POST" })。
export function appendMessage(
  sessionId: string,
  msg: Omit<SessionMessage, "id" | "sessionId" | "createdAt">
): void {
  const message: SessionMessage = {
    id: newId(),
    sessionId,
    createdAt: new Date().toISOString(),
    ...msg,
  };
  const messages = readMessages();
  messages.push(message);
  writeMessages(messages);
  touchSession(sessionId);
}

// TODO(backend): 后端 Message API 落地后替换为 fetch(`/api/sessions/${sessionId}/messages`)。
export function getMessages(sessionId: string): SessionMessage[] {
  return readMessages().filter((m) => m.sessionId === sessionId);
}
