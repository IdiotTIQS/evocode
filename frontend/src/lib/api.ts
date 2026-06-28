import type { IntentRequest, RunResult, RunSummary } from "@/types/intent";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

/** 控制平面在线但返回非 2xx 时抛出，携带 HTTP 状态码。 */
export class ControlPlaneError extends Error {
  constructor(public readonly status: number) {
    super(`Control plane error: ${status}`);
    this.name = "ControlPlaneError";
  }
}

export async function submitIntent(req: IntentRequest): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/intents`, {
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
  const resp = await fetch(
    `${BASE}/api/runs/${encodeURIComponent(runId)}/approve`,
    { method: "POST" }
  );
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const resp = await fetch(`${BASE}/api/runs?limit=${limit}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function getRun(runId: string): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/runs/${encodeURIComponent(runId)}`);
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
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body } : {}),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  });
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
