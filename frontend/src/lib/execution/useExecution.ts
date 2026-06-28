// frontend/src/lib/execution/useExecution.ts
// React hook：封装审批门状态机，优先走 SSE 流式端点（逐节点实时进度），
// 流式失败时优雅回退到非流式 POST 路径（已验证逻辑不变）。
//
// 诚实编排（见 executionMachine.ts 顶部说明）：
//   submitIntent(text) → SSE /api/runs/stream → 逐节点 phase 事件 → gate(plan)
//                        失败回退 → POST /api/intents
//   approvePlan()      → SSE /api/runs/{id}/approve/stream → 逐节点 → gate(diff)
//   approveDiff()      → SSE /api/runs/{id}/approve/stream → 逐节点 → done(completed)
//                        失败回退 → POST /api/runs/{id}/approve
//   reject()           → 回初始态（后端批准前未落盘，无需回滚）
//
// 关键约束：提交意图后绝不立即执行代码变更——后端在 generate 前真实中断；
// SSE 仅推送进度，不改变中断/落盘语义。inFlightRef 防双击；genRef 代次守卫
// 使 reject/reset 后迟到的事件/响应被丢弃；AbortController 主动取消在途流。

import { useCallback, useRef, useState } from "react";

import {
  approveRun as apiApproveRun,
  submitIntent as apiSubmitIntent,
  streamApprove,
  streamIntent,
  ControlPlaneError,
  type StreamEvent,
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
  sessionId?: string;
}

export interface UseExecutionApi {
  state: ExecutionState;
  gate?: ApprovalGateKind;
  plan?: PlanPreview;
  result?: RunResult;
  error?: string;
  /** 当前阶段文案（流式时为真实节点 label；回退时为静态文案）。 */
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
  sessionId,
}: UseExecutionOptions): UseExecutionApi {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot>(INITIAL_SNAPSHOT);
  const [phaseLabel, setPhaseLabel] = useState<string | undefined>(undefined);

  // 当前 run 的 id（plan gate 之后用于 resume）。
  const runIdRef = useRef<string>("");
  // 防重入锁：任一阶段请求在途时置位，杜绝双击触发重复后端调用。
  const inFlightRef = useRef(false);
  // 代次：每次发起请求自增；其异步落地时校验代次未变，否则丢弃（reject/reset 后的迟到事件）。
  const genRef = useRef(0);
  // 当前在途流的 AbortController，reject/reset 时主动取消。
  const abortRef = useRef<AbortController | null>(null);

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // 提交意图：优先 SSE 流，逐节点更新进度，停在 plan gate；流失败回退 POST。
  const submitIntent = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || inFlightRef.current) return;

      inFlightRef.current = true;
      const gen = ++genRef.current;
      runIdRef.current = "";
      setSnapshot(startPlanning());
      setPhaseLabel("正在理解意图、规划工程任务…");

      const controller = new AbortController();
      abortRef.current = controller;
      const req = {
        intent: trimmed,
        projectId,
        ...(repoPath !== undefined ? { repoPath } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
      };

      let sawResult = false;
      streamIntent(req, {
        signal: controller.signal,
        onEvent: (ev: StreamEvent) => {
          if (genRef.current !== gen) return;
          if (ev.type === "run") {
            runIdRef.current = ev.runId;
          } else if (ev.type === "phase") {
            setPhaseLabel(ev.label);
          } else if (ev.type === "gate" || ev.type === "done") {
            sawResult = true;
            inFlightRef.current = false;
            setPhaseLabel(undefined);
            const res = ev.result;
            if (res.status === "failed") {
              setSnapshot(fail({ state: "planning" }, res.message || "规划失败"));
            } else {
              setSnapshot(reachPlanGate(trimmed, res.taskGraph?.tasks ?? []));
            }
          } else if (ev.type === "failed") {
            sawResult = true;
            inFlightRef.current = false;
            setPhaseLabel(undefined);
            setSnapshot(fail({ state: "planning" }, ev.result?.message || "规划失败"));
          }
        },
      })
        .then(() => {
          // 流正常结束但未见终帧 → 回退 POST（避免卡在 planning）。
          if (genRef.current === gen && !sawResult) {
            submitViaPost(trimmed, gen, req);
          }
        })
        .catch(() => {
          // 流失败（含 abort）：仅当本代次仍有效且未拿到结果时回退 POST。
          if (genRef.current === gen && !sawResult && !controller.signal.aborted) {
            submitViaPost(trimmed, gen, req);
          }
        });
    },
    [projectId, repoPath, sessionId]
  );

  // 回退：非流式 POST 提交意图。
  const submitViaPost = useCallback(
    (trimmed: string, gen: number, req: { intent: string; projectId: string; repoPath?: string }) => {
      // 若 SSE 已收到 run 帧后才失败，runIdRef 持有那个 run 的 id；POST 会新建独立 run，
      // 故先清空，让 .then 用 POST 返回的新 runId。代价：SSE 那次的 checkpoint 在运行时
      // MemorySaver 中成为孤儿（不落盘、随进程重启回收）——可接受，已知限制。
      runIdRef.current = "";
      setPhaseLabel("正在理解意图、规划工程任务…");
      apiSubmitIntent(req)
        .then((res) => {
          if (genRef.current !== gen) return;
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          if (res.status === "failed") {
            setSnapshot(fail({ state: "planning" }, res.message || "规划失败"));
            return;
          }
          runIdRef.current = res.runId;
          setSnapshot(reachPlanGate(trimmed, res.taskGraph?.tasks ?? []));
        })
        .catch((err: unknown) => {
          if (genRef.current !== gen) return;
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          setSnapshot(fail({ state: "planning" }, errorDetail(err)));
        });
    },
    []
  );

  // 批准（plan/diff 通用流式逻辑）：onPhase 更新进度，gate/done 落终态；失败回退 POST。
  const approveViaStream = useCallback(
    (
      gate: ApprovalGateKind,
      working: ExecutionSnapshot,
      initialLabel: string
    ) => {
      const gen = ++genRef.current;
      inFlightRef.current = true;
      setSnapshot(working);
      setPhaseLabel(initialLabel);

      const controller = new AbortController();
      abortRef.current = controller;
      const runId = runIdRef.current;

      let sawResult = false;
      streamApprove(runId, {
        signal: controller.signal,
        onEvent: (ev: StreamEvent) => {
          if (genRef.current !== gen) return;
          if (ev.type === "phase") {
            setPhaseLabel(ev.label);
          } else if (ev.type === "gate" || ev.type === "done") {
            sawResult = true;
            inFlightRef.current = false;
            setPhaseLabel(undefined);
            const res = ev.result;
            if (res.status === "failed") {
              setSnapshot(fail(working, res.message || "执行失败"));
            } else if (res.status === "completed") {
              setSnapshot(complete(working, res));
            } else {
              // waiting_approval：到达下一个门（diff）。
              setSnapshot(reachDiffGate(working, res));
            }
          } else if (ev.type === "failed") {
            sawResult = true;
            inFlightRef.current = false;
            setPhaseLabel(undefined);
            setSnapshot(fail(working, ev.result?.message || "执行失败"));
          } else if (ev.type === "notfound") {
            sawResult = true;
            inFlightRef.current = false;
            setPhaseLabel(undefined);
            setSnapshot(fail(working, "运行不存在或已过期"));
          }
        },
      })
        .then(() => {
          if (genRef.current === gen && !sawResult) {
            approveViaPost(gate, working, gen);
          }
        })
        .catch(() => {
          if (genRef.current === gen && !sawResult && !controller.signal.aborted) {
            approveViaPost(gate, working, gen);
          }
        });
    },
    []
  );

  // 回退：非流式 POST 批准。
  const approveViaPost = useCallback(
    (gate: ApprovalGateKind, working: ExecutionSnapshot, gen: number) => {
      apiApproveRun(runIdRef.current)
        .then((res) => {
          if (genRef.current !== gen) return;
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          if (res.status === "failed") {
            setSnapshot(fail(working, res.message || "执行失败"));
            return;
          }
          if (res.status === "completed") {
            setSnapshot(complete(working, res));
          } else {
            setSnapshot(reachDiffGate(working, res));
          }
        })
        .catch((err: unknown) => {
          if (genRef.current !== gen) return;
          inFlightRef.current = false;
          setPhaseLabel(undefined);
          setSnapshot(fail(working, errorDetail(err)));
        });
    },
    []
  );

  // 批准计划：resume 越过 generate 门，生成 changeSet 后停在 diff gate（仍不落盘）。
  const approvePlan = useCallback(() => {
    if (
      inFlightRef.current ||
      snapshot.state !== "waiting_approval" ||
      snapshot.gate !== "plan" ||
      runIdRef.current.length === 0
    ) {
      return;
    }
    approveViaStream("plan", beginCoding(snapshot), "正在生成代码变更…");
  }, [snapshot, approveViaStream]);

  // 批准 diff：resume 越过 apply 门，落盘并完成。
  const approveDiff = useCallback(() => {
    if (
      inFlightRef.current ||
      snapshot.state !== "waiting_approval" ||
      snapshot.gate !== "diff" ||
      runIdRef.current.length === 0
    ) {
      return;
    }
    approveViaStream(
      "diff",
      beginApplying(snapshot),
      "正在应用变更（写入 evocode_generated/）…"
    );
  }, [snapshot, approveViaStream]);

  // 拒绝任意 gate → 回初始态。自增 genRef 并 abort 在途流，丢弃迟到事件。
  const reject = useCallback(() => {
    genRef.current += 1;
    cancelInFlight();
    inFlightRef.current = false;
    runIdRef.current = "";
    setPhaseLabel(undefined);
    setSnapshot(rejectGate());
  }, [cancelInFlight]);

  const reset = useCallback(() => {
    genRef.current += 1;
    cancelInFlight();
    inFlightRef.current = false;
    runIdRef.current = "";
    setPhaseLabel(undefined);
    setSnapshot({ ...INITIAL_SNAPSHOT });
  }, [cancelInFlight]);

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
