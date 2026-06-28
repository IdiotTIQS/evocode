import shutil
import tempfile
from pathlib import Path
from evocode_runtime.run_service import RunService

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_plan_stops_at_plan_gate_without_changeset():
    """提交意图只跑到 plan gate：waiting_approval/plan，无 changeSet（磁盘零写入）。"""
    result = RunService().plan(intent="add a comments api endpoint", project_id="demo")
    assert result.status == "waiting_approval"
    assert result.gate == "plan"
    assert result.run_id
    assert len(result.task_graph.tasks) >= 1
    assert any(t.kind == "backend" for t in result.task_graph.tasks)
    # 关键：批准前不得有任何生成物。
    assert result.change_set == []
    assert result.applied_files == []


def test_resume_once_reaches_diff_gate():
    """批准计划后 resume 到 diff gate：waiting_approval/diff，有 changeSet 但仍未落盘。"""
    svc = RunService()
    planned = svc.plan(intent="add a comments api endpoint", project_id="demo")
    resumed = svc.resume(planned.run_id)
    assert resumed is not None
    assert resumed.status == "waiting_approval"
    assert resumed.gate == "diff"
    assert resumed.run_id == planned.run_id
    assert len(resumed.change_set) >= 1
    assert any(f.path.endswith(".java") for f in resumed.change_set)
    # 关键：diff 门同样未落盘。
    assert resumed.applied_files == []


def test_resume_twice_completes_with_review():
    """批准 diff 后 resume 到 completed：含 review 裁定。"""
    svc = RunService()
    planned = svc.plan(intent="add a contact page", project_id="demo")
    svc.resume(planned.run_id)            # → diff gate
    final = svc.resume(planned.run_id)    # → completed
    assert final is not None
    assert final.status == "completed"
    assert final.gate is None
    assert final.phase == "applied"
    assert final.review is not None
    assert final.review.verdict in {"approve", "request_changes", "block"}
    assert isinstance(final.review.findings, list)


def test_resume_unknown_run_returns_none():
    """未知 run_id（无 checkpoint）→ None，由端点映射为 404。"""
    assert RunService().resume("does-not-exist") is None


def test_plan_without_repo_has_zero_graphstats():
    result = RunService().plan("add a comments api endpoint", "demo")
    assert result.status == "waiting_approval"
    assert result.graph_stats.file_count == 0


def test_full_cycle_with_repo_applies_only_after_diff_approval():
    """有 repo 时：plan/diff 门均不落盘，仅最终批准后 apply 写文件。"""
    import pytest
    if not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()):
        pytest.skip("node/ts-extractor unavailable")
    tmp = tempfile.mkdtemp()
    try:
        repo = str(Path(tmp) / "app")
        shutil.copytree(FIXTURE, repo)
        gen_dir = Path(repo) / "evocode_generated"
        svc = RunService()

        planned = svc.plan("add a product page", "demo", repo)
        assert planned.status == "waiting_approval" and planned.gate == "plan"
        assert planned.graph_stats.file_count >= 4
        assert not gen_dir.exists(), "plan gate 不得落盘"

        diff = svc.resume(planned.run_id)
        assert diff.status == "waiting_approval" and diff.gate == "diff"
        assert not gen_dir.exists(), "diff gate 不得落盘"

        final = svc.resume(planned.run_id)
        assert final.status == "completed"
        assert len(final.applied_files) >= 1
        assert gen_dir.exists(), "批准 diff 后才落盘"
    finally:
        shutil.rmtree(tmp)
