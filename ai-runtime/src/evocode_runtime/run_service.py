from uuid import uuid4
from evocode_runtime.graph import build_graph
from evocode_runtime.models import RunResult, TaskGraph, EngineeringTask

_graph = build_graph()


class RunService:
    """编排 LangGraph 执行，产出 RunResult。"""

    def execute(self, intent: str, project_id: str) -> RunResult:
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            final = _graph.invoke(
                {"intent": intent, "projectId": project_id,
                 "context": {}, "phase": "", "tasks": []},
                config=config)
            tasks = [EngineeringTask(**t) for t in final.get("tasks", [])]
            return RunResult(
                runId=run_id, status="completed", phase=final.get("phase", "planned"),
                taskGraph=TaskGraph(tasks=tasks),
                message=f"Planned {len(tasks)} task(s) for project {project_id}")
        except Exception as exc:  # noqa: BLE001
            return RunResult(
                runId=run_id, status="failed", phase="failed",
                taskGraph=TaskGraph(tasks=[]),
                message=f"Run failed: {exc}")
