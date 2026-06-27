from evocode_runtime.run_service import RunService


def test_execute_returns_completed_runresult():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.phase == "planned"
    assert len(result.task_graph.tasks) >= 1
    assert any(t.kind == "backend" for t in result.task_graph.tasks)
    assert result.run_id
