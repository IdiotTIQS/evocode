import logging
from uuid import uuid4
from evocode_runtime.graph import build_graph
from evocode_runtime.models import (
    RunResult, TaskGraph, EngineeringTask, ProjectGraphStats,
    ChangeFile, VerificationResult, Diagnostic,
)

logger = logging.getLogger(__name__)

_graph = build_graph()


class RunService:
    """编排 LangGraph 执行，产出 RunResult。"""

    def execute(self, intent: str, project_id: str, repo_path: str = "") -> RunResult:
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            final = _graph.invoke(
                {"intent": intent, "projectId": project_id, "repoPath": repo_path,
                 "context": {}, "phase": "", "tasks": [],
                 "changeSet": [], "applied": [], "verification": {}},
                config=config)
            tasks = [EngineeringTask(**t) for t in final.get("tasks", [])]
            stats = (final.get("context") or {}).get("stats") or {}
            gs = ProjectGraphStats(
                fileCount=stats.get("fileCount", 0),
                componentCount=stats.get("componentCount", 0),
                importCount=stats.get("importCount", 0),
                cacheHit=stats.get("cacheHit", False),
                graphVersionId=stats.get("graphVersionId"),
                maxImpactCount=stats.get("maxImpactCount", 0))
            change_set = [ChangeFile(**f) for f in final.get("changeSet", [])]
            applied = final.get("applied", [])
            v = final.get("verification") or {}
            verification = VerificationResult(
                checked=v.get("checked", False),
                passed=v.get("passed", False),
                diagnosticCount=v.get("diagnosticCount", 0),
                diagnostics=[Diagnostic(**d) for d in v.get("diagnostics", [])],
            ) if v else None
            return RunResult(
                runId=run_id, status="completed", phase=final.get("phase", "planned"),
                taskGraph=TaskGraph(tasks=tasks), graphStats=gs,
                changeSet=change_set, appliedFiles=applied, verification=verification,
                message=(f"Planned {len(tasks)} task(s), generated {len(change_set)} file(s)"
                         f"{f', applied {len(applied)}' if applied else ''} for project {project_id}"))
        except Exception:  # noqa: BLE001
            logger.exception("run %s failed", run_id)
            return RunResult(
                runId=run_id, status="failed", phase="failed",
                taskGraph=TaskGraph(tasks=[]), graph_stats=None,
                message="Run failed")

