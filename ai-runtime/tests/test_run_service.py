import shutil
from pathlib import Path
from evocode_runtime.run_service import RunService

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_execute_returns_completed_runresult():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.phase == "planned"
    assert len(result.task_graph.tasks) >= 1
    assert any(t.kind == "backend" for t in result.task_graph.tasks)
    assert result.run_id


def test_execute_without_repo_still_works():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.graph_stats.file_count == 0


def test_execute_with_repo_populates_graphstats():
    import pytest
    if not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()):
        pytest.skip("node/ts-extractor unavailable")
    result = RunService().execute("add a product page", "demo", FIXTURE)
    assert result.status == "completed"
    assert result.graph_stats.file_count >= 4
