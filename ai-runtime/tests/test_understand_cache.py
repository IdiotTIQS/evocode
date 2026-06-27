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
