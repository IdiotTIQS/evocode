import os, tempfile, shutil
from evocode_runtime.pkg.store import SqliteGraphStore

GRAPH = {
    "nodes": [
        {"id": "file:/a/page.tsx", "type": "File", "path": "/a/page.tsx"},
        {"id": "comp:/a/page.tsx#Page", "type": "Component", "name": "Page", "filePath": "/a/page.tsx"},
    ],
    "edges": [
        {"type": "IMPORTS", "from": "file:/a/page.tsx", "to": "file:/a/Button.tsx", "specifier": "./Button"},
        {"type": "DEFINES", "from": "file:/a/page.tsx", "to": "comp:/a/page.tsx#Page"},
    ],
}


def _store():
    tmp = tempfile.mkdtemp()
    return SqliteGraphStore(os.path.join(tmp, "data", "pkg.db")), tmp


def test_store_and_load_roundtrip():
    store, tmp = _store()
    try:
        vid = store.store_version("p", "/a", "fp1", GRAPH)
        g = store.load_graph(vid)
        assert len(g["nodes"]) == 2 and len(g["edges"]) == 2
        imp = [e for e in g["edges"] if e["type"] == "IMPORTS"][0]
        assert imp["specifier"] == "./Button"  # 额外字段保真
    finally:
        shutil.rmtree(tmp)


def test_find_active_hit_and_miss():
    store, tmp = _store()
    try:
        vid = store.store_version("p", "/a", "fp1", GRAPH)
        assert store.find_active_version("p", "/a", "fp1") == vid
        assert store.find_active_version("p", "/a", "fpX") is None  # miss
    finally:
        shutil.rmtree(tmp)


def test_new_version_supersedes_old():
    store, tmp = _store()
    try:
        v1 = store.store_version("p", "/a", "fp1", GRAPH)
        v2 = store.store_version("p", "/a", "fp2", GRAPH)
        assert store.find_active_version("p", "/a", "fp1") is None  # 旧被 supersede
        assert store.find_active_version("p", "/a", "fp2") == v2
        assert v2 != v1
    finally:
        shutil.rmtree(tmp)
