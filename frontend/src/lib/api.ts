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
