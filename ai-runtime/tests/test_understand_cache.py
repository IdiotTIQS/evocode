import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

import shutil as _sh
import pytest
requires_node = pytest.mark.skipif(
    not (_sh.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


@requires_node
def test_cache_miss_then_hit(monkeypatch, tmp_path):
    # 隔离 DB 到临时路径
    db = str(tmp_path / "data" / "pkg.db")
    monkeypatch.setenv("EVOCODE_PKG_DB", db)
    base = {"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
            "context": {}, "phase": "", "tasks": []}
    out1 = understand_node(dict(base))
    assert out1["context"]["stats"]["cacheHit"] is False
    assert out1["context"]["stats"]["graphVersionId"] is not None
    assert out1["context"]["stats"]["fileCount"] >= 4
    out2 = understand_node(dict(base))
    assert out2["context"]["stats"]["cacheHit"] is True  # 第二次命中
    assert out2["context"]["stats"]["graphVersionId"] == out1["context"]["stats"]["graphVersionId"]
    assert out2["context"]["stats"]["fileCount"] >= 4  # 读库重建保真


def test_no_repo_no_cache():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["cacheHit"] is False
    assert out["context"]["stats"]["fileCount"] == 0


@requires_node
def test_load_graph_failure_falls_through_to_extraction(monkeypatch, tmp_path):
    """I1: if load_graph raises on a cache hit, must fall through to extraction
    (cacheHit=False, fileCount>=4), NOT return an empty placeholder."""
    import evocode_runtime.graph.nodes as nodes_mod

    db = str(tmp_path / "data" / "pkg.db")
    monkeypatch.setenv("EVOCODE_PKG_DB", db)

    # Real SqliteGraphStore class so we can subclass it cleanly
    from evocode_runtime.pkg import SqliteGraphStore

    class BrokenLoadStore(SqliteGraphStore):
        """find_active_version returns a fake vid; load_graph always raises."""
        def find_active_version(self, project_id, repo_path, fingerprint):
            # Return a sentinel vid so the hit-branch is entered
            return 999

        def load_graph(self, vid):
            raise RuntimeError("simulated corrupt DB read")

        def store_version(self, project_id, repo_path, fingerprint, raw):
            # Delegate to real impl so the miss path can persist
            return super().store_version(project_id, repo_path, fingerprint, raw)

    # Patch SqliteGraphStore in the nodes module so understand_node uses our fake
    monkeypatch.setattr(nodes_mod, "SqliteGraphStore", BrokenLoadStore)

    state = {"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
             "context": {}, "phase": "", "tasks": []}
    out = understand_node(state)

    stats = out["context"]["stats"]
    # Must NOT be an empty placeholder
    assert stats["fileCount"] >= 4, (
        f"Expected real extraction (fileCount>=4) but got fileCount={stats['fileCount']}; "
        "load_graph failure may have hit placeholder instead of falling through to extract"
    )
    # cacheHit must be False — the hit branch failed, so we re-extracted
    assert stats["cacheHit"] is False, (
        "cacheHit should be False when load_graph raised and we fell through to extraction"
    )
