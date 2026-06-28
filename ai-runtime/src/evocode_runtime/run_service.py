import logging
from uuid import uuid4
from evocode_runtime.graph import build_graph
from evocode_runtime.models import (
    RunResult, TaskGraph, EngineeringTask, ProjectGraphStats,
    ChangeFile, VerificationResult, Diagnostic, ReviewOutput,
)

logger = logging.getLogger(__name__)

_graph = build_graph()


class RunService:
    """编排 LangGraph 执行，产出 RunResult。

    两段式审批门（兑现「批准前磁盘零写入」）：
      plan(intent, ...)  → invoke 到 interrupt_before=["generate"] → 返回 waiting_approval/plan
      resume(run_id)     → invoke(None) 续跑到下一个门或完成：
                            plan gate 之后 → 跑到 interrupt_before=["apply"] → waiting_approval/diff
                            diff gate 之后 → 跑完 apply → completed
    checkpoint 按 thread_id=run_id 由图的 MemorySaver 持有，故 resume 不需重传意图。
    """

    def plan(self, intent: str, project_id: str, repo_path: str = "") -> RunResult:
        """提交意图：跑 understand→plan→architect，停在 generate 前（plan gate）。"""
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            _graph.invoke(
                {"intent": intent, "projectId": project_id, "repoPath": repo_path,
                 "context": {}, "phase": "", "tasks": [],
                 "changeSet": [], "applied": [], "verification": {}},
                config=config)
            return self._result_from_state(run_id, project_id, _graph.get_state(config))
        except Exception:  # noqa: BLE001
            logger.exception("run %s plan failed", run_id)
            return self._failed(run_id)

    def resume(self, run_id: str) -> RunResult | None:
        """批准后续跑：从 checkpoint 越过当前门，到下一个门或完成。

        run_id 无对应 checkpoint（未知/已被回收）时返回 None，由调用方映射为 404。"""
        config = {"configurable": {"thread_id": run_id}}
        try:
            snapshot = _graph.get_state(config)
        except Exception:  # noqa: BLE001
            logger.exception("run %s get_state failed", run_id)
            return None
        # 无 checkpoint：从未规划过或已被回收。
        if not snapshot.created_at:
            return None
        project_id = snapshot.values.get("projectId", "")
        # 已无下一节点：流水线已完成，幂等返回当前结果（无需再 invoke）。
        if not snapshot.next:
            return self._result_from_state(run_id, project_id, snapshot)
        try:
            _graph.invoke(None, config=config)
            return self._result_from_state(run_id, project_id, _graph.get_state(config))
        except Exception:  # noqa: BLE001
            logger.exception("run %s resume failed", run_id)
            return self._failed(run_id)

    # --- 内部 ---

    def _result_from_state(self, run_id: str, project_id: str, snapshot) -> RunResult:
        """把给定的图 checkpoint 快照映射为 RunResult，依 next 节点判定 gate/status。"""
        values = snapshot.values or {}
        next_nodes = snapshot.next  # tuple，空表示已完成

        tasks = [EngineeringTask(**t) for t in values.get("tasks", [])]
        stats = (values.get("context") or {}).get("stats") or {}
        gs = ProjectGraphStats(
            fileCount=stats.get("fileCount", 0),
            componentCount=stats.get("componentCount", 0),
            importCount=stats.get("importCount", 0),
            cacheHit=stats.get("cacheHit", False),
            graphVersionId=stats.get("graphVersionId"),
            maxImpactCount=stats.get("maxImpactCount", 0))
        change_set = [ChangeFile(**f) for f in values.get("changeSet", [])]
        applied = values.get("applied", [])
        v = values.get("verification") or {}
        verification = VerificationResult(
            checked=v.get("checked", False),
            passed=v.get("passed", False),
            diagnosticCount=v.get("diagnosticCount", 0),
            diagnostics=[Diagnostic(**d) for d in v.get("diagnostics", [])],
        ) if v else None
        r = values.get("review") or {}
        review = ReviewOutput(**r) if r else None

        # 依下一个待执行节点判定停在哪个门。
        if "generate" in next_nodes:
            status, gate = "waiting_approval", "plan"
            message = (f"Planned {len(tasks)} task(s) for project {project_id}; "
                       f"awaiting plan approval (no files written)")
        elif "apply" in next_nodes:
            status, gate = "waiting_approval", "diff"
            message = (f"Generated {len(change_set)} file(s) for project {project_id}; "
                       f"awaiting diff approval (no files written yet)")
        else:
            status, gate = "completed", None
            message = (f"Planned {len(tasks)} task(s), generated {len(change_set)} file(s)"
                       f"{f', applied {len(applied)}' if applied else ''} for project {project_id}")

        return RunResult(
            runId=run_id, status=status, gate=gate,
            phase=values.get("phase", "planned"),
            taskGraph=TaskGraph(tasks=tasks), graphStats=gs,
            changeSet=change_set, appliedFiles=applied, verification=verification,
            review=review, message=message)

    def _failed(self, run_id: str) -> RunResult:
        return RunResult(
            runId=run_id, status="failed", gate=None, phase="failed",
            taskGraph=TaskGraph(tasks=[]), graph_stats=None,
            message="Run failed")
