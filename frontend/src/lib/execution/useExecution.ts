// frontend/src/lib/execution/useExecution.ts
// React hook：封装审批门状态机，对接后端真实两段式端点（无客户端进度模拟）。
//
// 诚实编排（见 executionMachine.ts 顶部说明）：
//   submitIntent(text) → POST /api/intents → 后端跑到 plan gate 真实中断
//                        → 停在 plan gate，展示真实 TaskGraph（磁盘零写入）
//   approvePlan()      → POST /api/runs/{id}/approve → 后端 resume 到 diff gate
//                        → 停在 diff gate，展示真实 changeSet（仍未落盘）
//   approveDiff()      → POST /api/runs/{id}/approve → 后端 resume 落盘并完成 → completed
//   reject()           → 回初始态（后端批准前未落盘，无需回滚）
//
// 关键约束：提交意图后绝不立即执行代码变更——后端在 generate 前真实中断，
// 真正的代码生成只在 approvePlan 之后发生，落盘只在 approveDiff 之后发生。
// inFlightRef 防止任一阶段请求在途时重复触发（双击）。

import { useCallback, useRef, useState } from "react";

import {
  approveRun as apiApproveRun,
  submitIntent as apiSubmitIntent,
  ControlPlaneError,
} from "@/lib/api";
import type { ExecutionState, RunResult } from "@/types/domain";
import {
  type ApprovalGateKind,
  type ExecutionSnapshot,
  type PlanPreview,
  INITIAL_SNAPSHOT,
  beginApplying,
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
  /** 当前阶段文案（请求在途时有值）。 */
  phaseLabel?: string;
  submitIntent: (text: string) => void;
  approvePlan: () => void;
  approveDiff: () => void;
  reject: () => void;
  /** 失败后重试：清空错误回到初始态（由调用方重新提交）。 */
  reset: () => void;
}

function errorDetail(err: unknown): string {
  if (err instanceof ControlPlaneError) return `控制平面错误 ${err.status}`;
  return "无法连接控制平面";
}

export function useExecution({
  projectId,
  repoPath,
}: UseExecutionOptions): UseExecutionApi {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot>(INITIAL_SNAPSHOT);
  const [phaseLabel, setPhaseLabel] = useState<string | undefined>(undefined);

  // 当前 run 的 id（plan gate 之后用于 resume）。
  const runIdRef = useRef<string>("");
  // 防重入锁：任一阶段请求在途时置位，杜绝双击触发重复后端调用。
  const inFlightRef = useRef(false);
  // 在途请求代次：每次发起请求自增；其 .then/.catch 落地时校验代次未变，
  // 否则说明期间发生了 reject/reset/新提交，丢弃这个迟到的响应（防止
  // 拒绝后迟到的成功响应把 UI 又弹回审批门/完成态）。
  const genRef = useRef(0);

  // 提交意图：调用真实后端，跑到 plan gate（后端在 generate 前中断）。绝不落盘。
  const submitIntent = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || inFlightRef.current) return;

      inFlightRef.current = true;
      const gen = ++genRef.current;
      runIdRef.current = "";
      setSnapshot(startPlanning());
      setPhaseLabel("正在理解意图、规划工程任务…");

      apiSubmitIntent({
        intent: trimmed,
        projectId,
        ...(repoPath !== undefined ? { repoPath } : {}),
      })
        .then((res) => {
          if (genRef.current !== gen) return; // 已被 reject/reset/新提交取代
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          if (res.status === "failed") {
            setSnapshot(fail({ state: "planning" }, res.message || "规划失败"));
            return;
          }
          runIdRef.current = res.runId;
          // 后端应返回 waiting_approval/plan，携带真实 TaskGraph。
          setSnapshot(reachPlanGate(trimmed, res.taskGraph?.tasks ?? []));
        })
        .catch((err: unknown) => {
          if (genRef.current !== gen) return;
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          setSnapshot(fail({ state: "planning" }, errorDetail(err)));
        });
    },
    [projectId, repoPath]
  );

  // 批准计划：resume 后端越过 generate 门，生成 changeSet 后停在 diff gate（仍不落盘）。
  const approvePlan = useCallback(() => {
    if (
      inFlightRef.current ||
      snapshot.state !== "waiting_approval" ||
      snapshot.gate !== "plan" ||
      runIdRef.current.length === 0
    ) {
      return;
    }

    inFlightRef.current = true;
    const gen = ++genRef.current;
    const coding = beginCoding(snapshot);
    setSnapshot(coding);
    setPhaseLabel("正在生成代码变更…");

    apiApproveRun(runIdRef.current)
      .then((res) => {
        if (genRef.current !== gen) return; // 已被 reject/reset 取代
        inFlightRef.current = false;
        setPhaseLabel(undefined);
        if (res.status === "failed") {
          setSnapshot(fail(coding, res.message || "代码生成失败"));
          return;
        }
        setSnapshot(reachDiffGate(coding, res));
      })
      .catch((err: unknown) => {
        if (genRef.current !== gen) return;
        inFlightRef.current = false;
        setPhaseLabel(undefined);
        setSnapshot(fail(coding, errorDetail(err)));
      });
  }, [snapshot]);

  // 批准 diff：resume 后端越过 apply 门，落盘并完成。
  const approveDiff = useCallback(() => {
    if (
      inFlightRef.current ||
      snapshot.state !== "waiting_approval" ||
      snapshot.gate !== "diff" ||
      runIdRef.current.length === 0
    ) {
      return;
    }

    inFlightRef.current = true;
    const gen = ++genRef.current;
    const applying = beginApplying(snapshot);
    setSnapshot(applying);
    setPhaseLabel("正在应用变更（写入 evocode_generated/）…");

    apiApproveRun(runIdRef.current)
      .then((res) => {
        if (genRef.current !== gen) return; // 已被 reject/reset 取代
        inFlightRef.current = false;
        setPhaseLabel(undefined);
        if (res.status === "failed") {
          setSnapshot(fail(applying, res.message || "应用失败"));
          return;
        }
        setSnapshot(complete(applying, res));
      })
      .catch((err: unknown) => {
        if (genRef.current !== gen) return;
        inFlightRef.current = false;
        setPhaseLabel(undefined);
        setSnapshot(fail(applying, errorDetail(err)));
      });
  }, [snapshot]);

  // 拒绝任意 gate → 回初始态。后端批准前未落盘，无需回滚。
  // 自增 genRef 使任何在途请求的 .then/.catch 落地时被丢弃，避免迟到响应弹回审批门。
  const reject = useCallback(() => {
    genRef.current += 1;
    inFlightRef.current = false;
    runIdRef.current = "";
    setPhaseLabel(undefined);
    setSnapshot(rejectGate());
  }, []);

  const reset = useCallback(() => {
    genRef.current += 1;
    inFlightRef.current = false;
    runIdRef.current = "";
    setPhaseLabel(undefined);
    setSnapshot({ ...INITIAL_SNAPSHOT });
  }, []);

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
