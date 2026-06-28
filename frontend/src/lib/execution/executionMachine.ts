// frontend/src/lib/execution/executionMachine.ts
// 审批门状态机（纯 TS）。
//
// 诚实编排（已对接真实后端两段式端点，不再有客户端进度模拟）：
//   - submitIntent → 调用真实 POST /api/intents：后端跑 understand→plan→architect
//     后【真实中断】于 generate 前，返回 status=waiting_approval / gate=plan，磁盘零写入。
//     前端据此停在 plan gate，并展示后端返回的【真实 TaskGraph】。
//   - approvePlan → 调用 POST /api/runs/{id}/approve：后端 resume 越过 generate 门，
//     跑到 apply 前再次中断，返回 gate=diff + 真实 changeSet（仍未落盘）。停在 diff gate。
//   - approveDiff → 再次 approve：后端 resume 越过 apply 门落盘并完成，返回 completed。
//   - 拒绝任意门 → 回初始态。由于后端在批准前从不落盘，拒绝无需回滚磁盘。
//
// 状态机为纯函数转移（便于测试）；副作用（网络）由 useExecution hook 驱动。
// 中间态（planning/coding/testing/reviewing）现由真实请求的在途/完成驱动，
// 而非定时器。
// TODO(backend): 逐节点 SSE 流，把单次 approve 往返细化为实时阶段推送。

import type { ExecutionState, RunResult } from "@/types/domain";
import type { EngineeringTask } from "@/types/intent";

/** 审批门类型：计划审批 vs diff（变更集）审批。仅在 waiting_approval 时有意义。 */
export type ApprovalGateKind = "plan" | "diff";

/**
 * 计划预览：后端规划阶段（understand→plan→architect）产出的真实 TaskGraph 摘要，
 * 供用户在生成代码前审批。
 */
export interface PlanPreview {
  intent: string;
  /** 后端返回的真实工程任务列表。 */
  tasks: EngineeringTask[];
  /** 将执行的流水线节点（与 PipelineStepper 对应），用于展示后续步骤。 */
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

/** 构造计划预览（携带后端返回的真实 TaskGraph）。 */
export function buildPlanPreview(
  intent: string,
  tasks: EngineeringTask[]
): PlanPreview {
  return {
    intent,
    tasks,
    pipeline: PIPELINE_NODES,
    note: "以上为后端规划阶段产出的工程任务。批准后才会生成代码（生成时仍不落盘，需再次批准 diff 才写入）。",
  };
}

// ── 纯函数状态转移 ──────────────────────────────────────────────────────────

/** 提交意图、请求在途：queued → planning（等待后端规划返回）。 */
export function startPlanning(): ExecutionSnapshot {
  return { state: "planning" };
}

/** 后端规划返回（waiting_approval/plan）：planning → waiting_approval(plan gate)。 */
export function reachPlanGate(
  intent: string,
  tasks: EngineeringTask[]
): ExecutionSnapshot {
  return {
    state: "waiting_approval",
    gate: "plan",
    plan: buildPlanPreview(intent, tasks),
  };
}

/** 批准计划、approve 请求在途：waiting_approval(plan) → coding。 */
export function beginCoding(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  const { gate: _gate, error: _error, ...rest } = snapshot;
  return { ...rest, state: "coding" };
}

/** 后端 diff 返回（waiting_approval/diff）：coding → waiting_approval(diff gate)。 */
export function reachDiffGate(
  snapshot: ExecutionSnapshot,
  result: RunResult
): ExecutionSnapshot {
  return { ...snapshot, state: "waiting_approval", gate: "diff", result };
}

/** 批准 diff、approve 请求在途：waiting_approval(diff) → reviewing。 */
export function beginApplying(snapshot: ExecutionSnapshot): ExecutionSnapshot {
  const { gate: _gate, error: _error, ...rest } = snapshot;
  return { ...rest, state: "reviewing" };
}

/** diff 批准并落盘完成：→ completed（携带最终结果）。 */
export function complete(
  snapshot: ExecutionSnapshot,
  result: RunResult
): ExecutionSnapshot {
  const { gate: _gate, ...rest } = snapshot;
  return { ...rest, state: "completed", result };
}

/** 任意 gate 拒绝：回到初始 queued 态。后端批准前未落盘，无需回滚。 */
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
// 为不破坏 Run 详情页对 PipelineStepper 的复用，这里把 ExecutionState 映射
// 到现有 phase 字符串（不改 PipelineStepper）。

export interface StepperMapping {
  phase: string;
  done: boolean;
}

/**
 * 将当前 ExecutionState（+gate）映射为 PipelineStepper 的 phase/done。
 * - planning → "planned"（规划在途）
 * - plan gate → "planned"（停在规划节点等批准）
 * - coding → "generated"（生成在途）
 * - diff gate → "reviewed"（生成+验证+审查已完成，等批准落盘）
 * - reviewing → "reviewed"（落盘在途）
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
