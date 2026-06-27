import shutil
import pytest
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


def test_understand_placeholder_without_repo():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["fileCount"] == 0
    assert out["phase"] == "understood"
    assert out["context"]["stats"]["cacheHit"] is False


@requires_node
def test_understand_real_pkg_with_repo(monkeypatch, tmp_path):
    monkeypatch.setenv("EVOCODE_PKG_DB", str(tmp_path / "data" / "pkg.db"))
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["fileCount"] >= 4
    assert out["context"]["stats"]["componentCount"] >= 4
