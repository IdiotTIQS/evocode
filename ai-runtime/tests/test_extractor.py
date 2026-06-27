import shutil
import pytest
from pathlib import Path
from evocode_runtime.pkg import TsExtractor, ProjectGraph

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
