import shutil, pytest
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


@requires_node
def test_understand_includes_max_impact(tmp_path, monkeypatch):
    monkeypatch.setenv("EVOCODE_PKG_DB", str(tmp_path / "data" / "pkg.db"))
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
                           "context": {}, "phase": "", "tasks": []})
    # fixture: page imports Button + Card → Button/Card impact=1; maxImpactCount=1
    assert out["context"]["stats"]["maxImpactCount"] >= 1


def test_placeholder_max_impact_zero():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["maxImpactCount"] == 0
