// frontend/src/lib/execution/executionMachine.ts
// 审批门状态机（纯 TS）+ 客户端进度模拟。
//
// 诚实边界：后端是一把梭——submitIntent 一次同步跑完整流水线，没有独立 /plan
// 端点、没有 SSE 流、没有 apply 端点。因此本模块做的是「客户端编排 + 进度模拟 +
// 真实暂停审批」：
//   - 提交意图后只进入 planning（模拟短延迟 + 文案），不调用后端。
//   - 在 waiting_approval(plan gate) 处【真实暂停】等用户点批准——批准前绝不
//     调用 submitIntent（兑现「绝不在提交意图后立即执行代码变更」）。
//   - 批准计划后才真正调用 submitIntent；其同步返回的完整 RunResult 被拆开：
//     coding/testing/reviewing 用模拟阶段推进展示文案，changeSet 留到
//     waiting_approval(diff gate) 展示，verification/review 在 reviewing/completed 展示。
//   - 批准 diff 后进入 completed（应用动作当前为确认，生成物已写入 evocode_generated/）。
//
// 状态机本身是纯函数转移（便于测试）；副作用（定时器、网络）由 useExecution hook 驱动。

import type { ExecutionState, RunResult } from "@/types/domain";

/** 审批门类型：计划审批 vs diff（变更集）审批。仅在 waiting_approval 时有意义。 */
export type ApprovalGateKind = "plan" | "diff";

/**
 * 计划预览。诚实点：后端无独立规划端点，所以这是「意图摘要 + 将执行的六节点
 * 流水线说明」，而非真实 TaskGraph。
 * // TODO(backend): 接入独立 /plan 端点返回 TaskGraph 供审批，替换此意图摘要。
 */
export interface PlanPreview {
  intent: string;
  /** 将执行的流水线节点（与 PipelineStepper 对应）。 */
  pipeline: { key: string; label: string }[];
  note: string;
}

/** 状态机快照。gate 仅在 state === "waiting_approval" 时存在。 */
export interface ExecutionSnapshot {
  state: ExecutionState;
  gate?: ApprovalGateKind;
  plan?: PlanPreview;
  result?: RunResult;
  error?: string;
}

/** 客户端模拟阶段（用于 coding/testing/reviewing 的文案推进）。 */
export interface SimPhase {
  state: Extract<ExecutionState, "planning" | "coding" | "testing" | "reviewing">;
  label: string;
  /** 模拟延迟（毫秒）。// TODO(backend): replace with real SSE stream timings。 */
  delayMs: number;
}

export const INITIAL_SNAPSHOT: ExecutionSnapshot = { state: "queued" };

/** 将执行的六节点流水线（与 PipelineStepper 的 PHASE_ORDER 对应）。 */
export const PIPELINE_NODES: { key: string; label: string }[] = [
  { key: "understand", label: "理解" },
  { key: "plan", label: "规划" },
  { key: "architect", label: "架构" },
  { key: "generate", label: "生成" },
  { key: "verify", label: "验证" },
  { key: "review", label: "审查" },
];

/** 构造计划预览（意图摘要 + 流水线说明）。 */
export function buildPlanPreview(intent: string): PlanPreview {
  return {
    intent,
    pipeline: PIPELINE_NODES,
    note: "计划预览（后端独立规划端点落地前为意图摘要）。批准后才会真正生成代码。",
  };
}

// ── 模拟阶段序列 ────────────────────────────────────────────────────────────
// 提交意图后的 planning 阶段（停在 plan gate 前）。
// // TODO(backend): replace with real SSE/staged API from /api/runs/{id}/stream
export const PLANNING_PHASES: SimPhase[] = [
  { state: "planning", label: "正在理解意图与梳理上下文…", delayMs: 700 },
];

// 批准计划后、拿到 RunResult 前的执行阶段（停在 diff gate 前）。
// 这些文案是【客户端模拟】，真实 submitIntent 在此期间同步执行。
// // TODO(backend): replace with real SSE/staged API from /api/runs/{id}/stream
export const CODING_PHASES: SimPhase[] = [
  { state: "coding", label: "正在生成代码变更…", delayMs: 600 },
  { state: "testing", label: "正在运行类型检查与验证…", delayMs: 600 },
  { state: "reviewing", label: "正在进行代码审查…", delayMs: 600 },
];

// ── 纯函数状态转移 ──────────────────────────────────────────────────────────

/** 提交意图：queued → planning（携带计划预览）。批准前不调用后端。 */
export function startPlanning(intent: string): ExecutionSnapshot {
  return { state: "planning", plan: buildPlanPreview(intent) };
}

/** planning 模拟结束：planning → waiting_approval(plan gate)。 */
export function reachPlanGate(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  return { ...snapshot, state: "waiting_approval", gate: "plan" };
}

/** 批准计划：waiting_approval(plan) → coding（开始执行阶段）。 */
export function beginCoding(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  const { gate: _gate, error: _error, ...rest } = snapshot;
  return { ...rest, state: "coding" };
}

/** 推进到某个模拟执行阶段（coding/testing/reviewing）。 */
export function advanceTo(
  snapshot: ExecutionSnapshot,
  state: SimPhase["state"]
): ExecutionSnapshot {
  return { ...snapshot, state };
}

/** 执行阶段全部结束、已拿到 RunResult：reviewing → waiting_approval(diff gate)。 */
export function reachDiffGate(
  snapshot: ExecutionSnapshot,
  result: RunResult
): ExecutionSnapshot {
  return { ...snapshot, state: "waiting_approval", gate: "diff", result };
}

/** 批准 diff：waiting_approval(diff) → completed。 */
export function complete(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  const { gate: _gate, ...rest } = snapshot;
  return { ...rest, state: "completed" };
}

/** 任意 gate 拒绝：回到初始 queued 态（清空 gate/plan/result/error）。 */
export function rejectGate(): ExecutionSnapshot {
  return { ...INITIAL_SNAPSHOT };
}

/** 失败：进入 failed 态并携带错误信息（可重试）。 */
export function fail(snapshot: ExecutionSnapshot, error: string): ExecutionSnapshot {
  const { gate: _gate, ...rest } = snapshot;
  return { ...rest, state: "failed", error };
}

// ── ExecutionState → PipelineStepper phase 映射 ─────────────────────────────
// PipelineStepper 接受 { phase: string, done?: boolean }，其内部 PHASE_TO_INDEX
// 用的是 understood/planned/architected/generated/verified/reviewed。
// 为不破坏 Run 详情页对 PipelineStepper 的复用，这里把 8 态 ExecutionState 映射
// 到现有 phase 字符串（不改 PipelineStepper）。

export interface StepperMapping {
  phase: string;
  done: boolean;
}

/**
 * 将当前 ExecutionState（+gate）映射为 PipelineStepper 的 phase/done。
 * - planning / plan gate → "planned"（停在规划节点）
 * - coding → "generated"（生成节点）
 * - testing → "verified"（验证节点）
 * - reviewing / diff gate → "reviewed"（审查节点）
 * - completed → done=true（全亮）
 * - failed / queued → 沿用最近阶段或起点
 */
export function mapStateToStepper(
  state: ExecutionState,
  gate?: ApprovalGateKind
): StepperMapping {
  switch (state) {
    case "queued":
      return { phase: "understood", done: false };
    case "planning":
      return { phase: "planned", done: false };
    case "waiting_approval":
      return gate === "diff"
        ? { phase: "reviewed", done: false }
        : { phase: "planned", done: false };
    case "coding":
      return { phase: "generated", done: false };
    case "testing":
      return { phase: "verified", done: false };
    case "reviewing":
      return { phase: "reviewed", done: false };
    case "completed":
      return { phase: "reviewed", done: true };
    case "failed":
      return { phase: "planned", done: false };
  }
}
