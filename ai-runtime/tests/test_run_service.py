import shutil
import tempfile
from pathlib import Path
from evocode_runtime.run_service import RunService

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_execute_returns_completed_runresult():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.phase == "verified"
    assert len(result.task_graph.tasks) >= 1
    assert any(t.kind == "backend" for t in result.task_graph.tasks)
    assert result.run_id
    # generate 阶段产出真实代码文件
    assert len(result.change_set) >= 1
    assert any(f.path.endswith(".java") for f in result.change_set)


def test_execute_without_repo_still_works():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.graph_stats.file_count == 0


def test_execute_with_repo_populates_graphstats():
    import pytest
    if not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()):
        pytest.skip("node/ts-extractor unavailable")
    # 用 fixture 的临时副本，避免 generate 阶段写文件污染真实 fixture
    tmp = tempfile.mkdtemp()
    try:
        repo = str(Path(tmp) / "app")
        shutil.copytree(FIXTURE, repo)
        result = RunService().execute("add a product page", "demo", repo)
        assert result.status == "completed"
        assert result.graph_stats.file_count >= 4
        # generate 阶段真的写了文件到副本
        assert len(result.applied_files) >= 1
    finally:
        shutil.rmtree(tmp)
