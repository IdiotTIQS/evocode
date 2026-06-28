// frontend/src/types/domain.ts
// EvoCode 领域类型。Run 相关类型从 @/types/intent 复用并统一从此处出口，
// 方便后续后端实体迁移时只改一处。
import type { RunResult, RunSummary } from "@/types/intent";

export type ExecutionState =
  | "queued"
  | "planning"
  | "waiting_approval"
  | "coding"
  | "testing"
  | "reviewing"
  | "completed"
  | "failed";

// 供 UI 遍历的状态顺序常量。
export const EXECUTION_STATES: ExecutionState[] = [
  "queued",
  "planning",
  "waiting_approval",
  "coding",
  "testing",
  "reviewing",
  "completed",
  "failed",
];

export interface Project {
  id: string;
  name: string;
  repoPath?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: "user" | "agent";
  kind: "intent" | "status" | "result";
  text: string;
  runId?: string;
  createdAt: string;
}

// 统一从 domain 出口 Run 类型。
export type { RunResult, RunSummary };
