import type { IntentRequest, RunResult } from "@/types/intent";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

export async function submitIntent(req: IntentRequest): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!resp.ok) throw new Error(`Control plane error: ${resp.status}`);
  return resp.json();
}
