from uuid import uuid4
from evocode_runtime.graph import build_graph
from evocode_runtime.models import RunResult, TaskGraph, EngineeringTask, ProjectGraphStats

_graph = build_graph()


class RunService:
    """编排 LangGraph 执行，产出 RunResult。"""

    def execute(self, intent: str, project_id: str, repo_path: str = "") -> RunResult:
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            final = _graph.invoke(
                {"intent": intent, "projectId": project_id, "repoPath": repo_path,
                 "context": {}, "phase": "", "tasks": []},
                config=config)
            tasks = [EngineeringTask(**t) for t in final.get("tasks", [])]
            stats = (final.get("context") or {}).get("stats") or {}
            gs = ProjectGraphStats(
                fileCount=stats.get("fileCount", 0),
                componentCount=stats.get("componentCount", 0),
                importCount=stats.get("importCount", 0))
            return RunResult(
                runId=run_id, status="completed", phase=final.get("phase", "planned"),
                taskGraph=TaskGraph(tasks=tasks), graphStats=gs,
                message=f"Planned {len(tasks)} task(s) for project {project_id}")
        except Exception:  # noqa: BLE001
            return RunResult(
                runId=run_id, status="failed", phase="failed",
                taskGraph=TaskGraph(tasks=[]), graph_stats=None,
                message="Run failed")
