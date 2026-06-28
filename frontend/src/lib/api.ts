import type { IntentRequest, RunResult, RunSummary } from "@/types/intent";
import type { AuthResponse, AuthUser } from "@/types/auth";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

/** 控制平面在线但返回非 2xx 时抛出，携带 HTTP 状态码。 */
export class ControlPlaneError extends Error {
  constructor(public readonly status: number) {
    super(`Control plane error: ${status}`);
    this.name = "ControlPlaneError";
  }
}

// ── 认证 token 管理 ──────────────────────────────────────────────────────────
// token 存 localStorage；内存缓存避免每次读 storage。所有受保护请求自动带上。
const TOKEN_KEY = "evocode.token";
let tokenCache: string | null = null;

export function getToken(): string | null {
  if (tokenCache !== null) return tokenCache;
  if (typeof window === "undefined") return null;
  tokenCache = window.localStorage.getItem(TOKEN_KEY);
  return tokenCache;
}

export function setToken(token: string | null): void {
  tokenCache = token;
  unauthorizedFired = false;  // 新 token：重置 401 去重标记
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** 未授权（401）回调：由 AuthProvider 注册，用于全局登出 + 跳登录。 */
let onUnauthorized: (() => void) | null = null;
// 去重：多个并发请求同时 401 时只触发一次登出/跳转，避免重复 router.push。
let unauthorizedFired = false;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

function fireUnauthorized(): void {
  if (unauthorizedFired) return;
  unauthorizedFired = true;
  onUnauthorized?.();
}

/** 统一 fetch：自动加 Bearer 头；401 触发全局登出回调后抛错。导出供 store 适配器复用。 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(input, { ...init, headers });
  if (resp.status === 401) {
    fireUnauthorized();
    throw new ControlPlaneError(401);
  }
  return resp;
}

// ── 认证端点 ────────────────────────────────────────────────────────────────
export async function register(email: string, password: string): Promise<AuthResponse> {
  const resp = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const resp = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

/** 校验当前 token 并取用户信息（刷新页面时水合）。 */
export async function fetchMe(): Promise<AuthUser> {
  const resp = await authFetch(`${BASE}/api/auth/me`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function submitIntent(req: IntentRequest): Promise<RunResult> {
  const resp = await authFetch(`${BASE}/api/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

/**
 * 批准当前审批门：让运行时从 checkpoint 越过该门到下一个门或完成。
 * plan gate 批准 → 返回 diff gate（生成 changeSet，仍未落盘）；
 * diff gate 批准 → 返回 completed（已落盘）。
 */
export async function approveRun(runId: string): Promise<RunResult> {
  const resp = await authFetch(
    `${BASE}/api/runs/${encodeURIComponent(runId)}/approve`,
    { method: "POST" }
  );
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function listRuns(limit = 20, sessionId?: string): Promise<RunSummary[]> {
  const qs = sessionId !== undefined
    ? `?limit=${limit}&sessionId=${encodeURIComponent(sessionId)}`
    : `?limit=${limit}`;
  const resp = await authFetch(`${BASE}/api/runs${qs}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function getRun(runId: string): Promise<RunResult> {
  const resp = await authFetch(`${BASE}/api/runs/${encodeURIComponent(runId)}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

// ── SSE 流式 ────────────────────────────────────────────────────────────────
// 用 fetch + ReadableStream 消费 SSE（需 POST body，故不用 EventSource）。
// 兼容两种帧前缀：`data: {json}`（Python）与 `data:{json}`（Spring SseEmitter）。

/** SSE 事件类型（与运行时 run_service 产出对齐）。 */
export type StreamEvent =
  | { type: "run"; runId: string }
  | { type: "phase"; node: string; phase?: string | null; label: string }
  | { type: "gate"; result: RunResult }
  | { type: "done"; result: RunResult }
  | { type: "failed"; result?: RunResult }
  | { type: "notfound" };

export interface StreamHandlers {
  onEvent: (ev: StreamEvent) => void;
  /** 调用方传入信号以便取消（reject/卸载）。 */
  signal?: AbortSignal;
}

function parseSseData(line: string): string | null {
  if (line.startsWith("data:")) {
    const rest = line.slice("data:".length);
    return rest.startsWith(" ") ? rest.slice(1) : rest;
  }
  return null;
}

/** 通用 SSE POST 流读取：逐帧解析并回调，直到流结束或被 abort。 */
async function streamPost(
  url: string,
  body: string | undefined,
  handlers: StreamHandlers
): Promise<void> {
  const token = getToken();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  });
  if (resp.status === 401) {
    fireUnauthorized();
    throw new ControlPlaneError(401);
  }
  if (!resp.ok || !resp.body) throw new ControlPlaneError(resp.status || 0);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 帧以空行分隔；按行解析 data: 负载。
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      const data = parseSseData(line);
      if (data && data.length > 0) {
        try {
          handlers.onEvent(JSON.parse(data) as StreamEvent);
        } catch {
          // 跳过无法解析的帧（保活注释等）。
        }
      }
    }
  }
}

/** 流式提交意图：逐节点 onEvent，最终 gate(plan)。 */
export function streamIntent(req: IntentRequest, handlers: StreamHandlers): Promise<void> {
  return streamPost(`${BASE}/api/runs/stream`, JSON.stringify(req), handlers);
}

/** 流式批准：逐节点 onEvent，最终 gate(diff) 或 done。 */
export function streamApprove(runId: string, handlers: StreamHandlers): Promise<void> {
  return streamPost(
    `${BASE}/api/runs/${encodeURIComponent(runId)}/approve/stream`,
    undefined,
    handlers
  );
}
