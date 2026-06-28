import type { IntentRequest, RunResult } from "@/types/intent";

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
