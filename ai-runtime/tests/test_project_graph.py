from evocode_runtime.pkg.graph import ProjectGraph

NODES = [
    {"id": "file:/a/page.tsx", "type": "File", "path": "/a/page.tsx"},
    {"id": "file:/a/Button.tsx", "type": "File", "path": "/a/Button.tsx"},
    {"id": "component:/a/page.tsx#Page", "type": "Component", "name": "Page", "filePath": "/a/page.tsx"},
    {"id": "component:/a/Button.tsx#Button", "type": "Component", "name": "Button", "filePath": "/a/Button.tsx"},
]
EDGES = [
    {"type": "IMPORTS", "from": "file:/a/page.tsx", "to": "file:/a/Button.tsx", "specifier": "./Button"},
    {"type": "DEFINES", "from": "file:/a/page.tsx", "to": "component:/a/page.tsx#Page"},
    {"type": "DEFINES", "from": "file:/a/Button.tsx", "to": "component:/a/Button.tsx#Button"},
]


def test_files_and_components():
    pg = ProjectGraph(NODES, EDGES)
    assert len(pg.files()) == 2
    assert len(pg.components()) == 2


def test_imports_of():
    pg = ProjectGraph(NODES, EDGES)
    assert pg.imports_of("file:/a/page.tsx") == ["file:/a/Button.tsx"]


def test_stats():
    pg = ProjectGraph(NODES, EDGES)
    s = pg.stats()
    assert s == {"fileCount": 2, "componentCount": 2, "importCount": 1}


def test_to_context():
    pg = ProjectGraph(NODES, EDGES)
    ctx = pg.to_context("demo")
    assert ctx["projectId"] == "demo"
    assert ctx["stats"]["componentCount"] == 2
    assert len(ctx["graph"]["nodes"]) == 4
