// frontend/src/lib/execution/useExecution.ts
// React hook：封装审批门状态机，管理 ExecutionState 流转、定时器副作用与错误。
//
// 诚实编排（见 executionMachine.ts 顶部说明）：
//   submitIntent(text) → planning 模拟 → 停在 plan gate（真实暂停，不调后端）
//   approvePlan()      → coding/testing/reviewing 模拟推进，期间真实调用 submitIntent
//                        → 停在 diff gate（展示 changeSet）
//   approveDiff()      → completed
//   reject()           → 回初始态
// 所有定时器在卸载/重置时清理，防 setState-after-unmount。

import { useCallback, useEffect, useRef, useState } from "react";

import { submitIntent as apiSubmitIntent, ControlPlaneError } from "@/lib/api";
import type { ExecutionState, RunResult } from "@/types/domain";
import {
  type ApprovalGateKind,
  type ExecutionSnapshot,
  type PlanPreview,
  CODING_PHASES,
  INITIAL_SNAPSHOT,
  PLANNING_PHASES,
  advanceTo,
  beginCoding,
  complete,
  fail,
  reachDiffGate,
  reachPlanGate,
  rejectGate,
  startPlanning,
} from "./executionMachine";

export interface UseExecutionOptions {
  projectId: string;
  repoPath?: string;
}

export interface UseExecutionApi {
  state: ExecutionState;
  gate?: ApprovalGateKind;
  plan?: PlanPreview;
  result?: RunResult;
  error?: string;
  /** 当前模拟阶段文案（planning/coding/testing/reviewing 时有值）。 */
  phaseLabel?: string;
  submitIntent: (text: string) => void;
  approvePlan: () => void;
  approveDiff: () => void;
  reject: () => void;
  /** 失败后重试：清空错误回到初始态（由调用方重新提交）。 */
  reset: () => void;
}

export function useExecution({
  projectId,
  repoPath,
}: UseExecutionOptions): UseExecutionApi {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot>(INITIAL_SNAPSHOT);
  const [phaseLabel, setPhaseLabel] = useState<string | undefined>(undefined);

  // 保存待批准的意图（plan gate 真实暂停期间持有，批准后才用它调后端）。
  const pendingIntentRef = useRef<string>("");
  // 跟踪所有挂起的定时器，便于统一清理。
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 卸载标记，阻止 setState-after-unmount。
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // 卸载时清掉所有定时器。
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, []);

  const safeSet = useCallback((next: ExecutionSnapshot) => {
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const safeSetLabel = useCallback((label: string | undefined) => {
    if (mountedRef.current) setPhaseLabel(label);
  }, []);

  // 提交意图：进入 planning 模拟，结束后停在 plan gate。绝不调用后端。
  const submitIntent = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      clearTimers();
      pendingIntentRef.current = trimmed;

      const planning = startPlanning(trimmed);
      safeSet(planning);

      // 客户端模拟 planning 阶段文案推进。
      // // TODO(backend): replace with real SSE stream from /api/runs/{id}/stream
      let cursor = 0;
      const runNext = () => {
        if (cursor >= PLANNING_PHASES.length) {
          // planning 模拟结束 → 真实暂停于 plan gate。
          safeSetLabel(undefined);
          safeSet(reachPlanGate(planning));
          return;
        }
        const phase = PLANNING_PHASES[cursor]!;
        safeSetLabel(phase.label);
        cursor += 1;
        const timer = setTimeout(runNext, phase.delayMs);
        timersRef.current.push(timer);
      };
      runNext();
    },
    [clearTimers, safeSet, safeSetLabel]
  );

  // 批准计划：现在才真正执行——模拟 coding/testing/reviewing 推进，期间调用后端。
  const approvePlan = useCallback(() => {
    const intent = pendingIntentRef.current;
    if (intent.length === 0) return;

    clearTimers();
    const codingStart = beginCoding(snapshot);
    safeSet(codingStart);

    // 真实网络调用（批准后才发起，兑现「批准后才执行」）。它同步跑完整流水线。
    const fetchPromise = apiSubmitIntent({
      intent,
      projectId,
      ...(repoPath !== undefined ? { repoPath } : {}),
    });

    // 并行：客户端模拟阶段文案推进（coding→testing→reviewing）。
    // // TODO(backend): replace with real SSE stream from /api/runs/{id}/stream
    let cursor = 0;
    let current = codingStart;
    const runPhase = () => {
      if (cursor >= CODING_PHASES.length) {
        // 模拟阶段跑完，等待真实结果落地后进入 diff gate（见下方 then）。
        return;
      }
      const phase = CODING_PHASES[cursor]!;
      current = advanceTo(current, phase.state);
      safeSet(current);
      safeSetLabel(phase.label);
      cursor += 1;
      const timer = setTimeout(runPhase, phase.delayMs);
      timersRef.current.push(timer);
    };
    runPhase();

    fetchPromise
      .then((runResult) => {
        if (!mountedRef.current) return;
        if (runResult.status === "failed") {
          clearTimers();
          safeSetLabel(undefined);
          safeSet(fail(current, runResult.message || "运行失败"));
          return;
        }
        // 真实结果就绪：停在 diff gate 展示 changeSet。
        // 若模拟阶段还没跑完，给最短一个延迟确保 UI 至少经过 reviewing 文案。
        const finalize = () => {
          if (!mountedRef.current) return;
          clearTimers();
          safeSetLabel(undefined);
          safeSet(reachDiffGate({ ...current, state: "reviewing" }, runResult));
        };
        // 等剩余模拟阶段大致结束再进入 diff gate，避免文案一闪而过。
        const remaining = Math.max(0, CODING_PHASES.length - cursor) * 200;
        const timer = setTimeout(finalize, remaining);
        timersRef.current.push(timer);
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        clearTimers();
        safeSetLabel(undefined);
        const detail =
          err instanceof ControlPlaneError
            ? `控制平面错误 ${err.status}`
            : "无法连接控制平面";
        safeSet(fail(current, detail));
      });
  }, [snapshot, projectId, repoPath, clearTimers, safeSet, safeSetLabel]);

  // 批准 diff → completed。应用动作当前为确认（生成物已写入 evocode_generated/）。
  // // TODO(backend): apply changes 端点；当前生成物已写入 evocode_generated/，此处为确认动作。
  const approveDiff = useCallback(() => {
    clearTimers();
    safeSet(complete(snapshot));
  }, [snapshot, clearTimers, safeSet]);

  // 拒绝任意 gate → 回初始态。
  const reject = useCallback(() => {
    clearTimers();
    pendingIntentRef.current = "";
    safeSetLabel(undefined);
    safeSet(rejectGate());
  }, [clearTimers, safeSet, safeSetLabel]);

  const reset = useCallback(() => {
    clearTimers();
    pendingIntentRef.current = "";
    safeSetLabel(undefined);
    safeSet({ ...INITIAL_SNAPSHOT });
  }, [clearTimers, safeSet, safeSetLabel]);

  return {
    state: snapshot.state,
    ...(snapshot.gate !== undefined ? { gate: snapshot.gate } : {}),
    ...(snapshot.plan !== undefined ? { plan: snapshot.plan } : {}),
    ...(snapshot.result !== undefined ? { result: snapshot.result } : {}),
    ...(snapshot.error !== undefined ? { error: snapshot.error } : {}),
    ...(phaseLabel !== undefined ? { phaseLabel } : {}),
    submitIntent,
    approvePlan,
    approveDiff,
    reject,
    reset,
  };
}
