import shutil
import pytest
from pathlib import Path
from evocode_runtime.pkg import TsExtractor, ProjectGraph
from evocode_runtime.pkg.extractor import ExtractionError, _validate_graph

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = REPO_ROOT / "test" / "fixtures" / "next-app"

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node or ts-extractor node_modules not available")


@requires_node
def test_extract_fixture():
    ex = TsExtractor()
    assert ex.is_available()
    raw = ex.extract(str(FIXTURE))
    pg = ProjectGraph(raw["nodes"], raw["edges"])
    assert len(pg.files()) >= 4
    assert len(pg.components()) >= 4
    s = pg.stats()
    assert s["importCount"] >= 2  # page imports Button + Card


@pytest.mark.parametrize("bad", [
    None,
    [],
    42,
    "string",
    {},
    {"nodes": []},
    {"edges": []},
    {"nodes": None, "edges": []},
    {"nodes": [], "edges": None},
])
def test_validate_graph_rejects_bad_shapes(bad):
    with pytest.raises(ExtractionError, match="unexpected extractor output shape"):
        _validate_graph(bad)


def test_validate_graph_accepts_valid():
    # Should not raise
    _validate_graph({"nodes": [], "edges": []})
    _validate_graph({"nodes": [{"id": "x"}], "edges": [{"type": "IMPORTS"}]})
