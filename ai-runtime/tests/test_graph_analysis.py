from evocode_runtime.pkg.graph import ProjectGraph

# A imports B, B imports C  (链)
NODES = [
    {"id": "file:/A.tsx", "type": "File", "path": "/A.tsx"},
    {"id": "file:/B.tsx", "type": "File", "path": "/B.tsx"},
    {"id": "file:/C.tsx", "type": "File", "path": "/C.tsx"},
    {"id": "comp:/A.tsx#A", "type": "Component", "name": "A", "filePath": "/A.tsx"},
]
EDGES = [
    {"type": "IMPORTS", "from": "file:/A.tsx", "to": "file:/B.tsx"},
    {"type": "IMPORTS", "from": "file:/B.tsx", "to": "file:/C.tsx"},
    {"type": "DEFINES", "from": "file:/A.tsx", "to": "comp:/A.tsx#A"},
]


def test_dependencies_of_transitive():
    pg = ProjectGraph(NODES, EDGES)
    # A 依赖 B 和 C（传递）
    assert pg.dependencies_of("file:/A.tsx") == ["file:/B.tsx", "file:/C.tsx"]


def test_dependencies_of_depth_limit():
    pg = ProjectGraph(NODES, EDGES)
    # 限深 1：A 只直接依赖 B
    assert pg.dependencies_of("file:/A.tsx", max_depth=1) == ["file:/B.tsx"]


def test_impact_of_transitive():
    pg = ProjectGraph(NODES, EDGES)
    # 改 C 波及 B 和 A（反向传递）
    assert pg.impact_of("file:/C.tsx") == ["file:/A.tsx", "file:/B.tsx"]


def test_impact_of_leaf():
    pg = ProjectGraph(NODES, EDGES)
    # 改 A 不波及任何人（无人导入 A）
    assert pg.impact_of("file:/A.tsx") == []


def test_components_in():
    pg = ProjectGraph(NODES, EDGES)
    comps = pg.components_in("file:/A.tsx")
    assert len(comps) == 1 and comps[0]["name"] == "A"


def test_find_file_by_suffix():
    pg = ProjectGraph(NODES, EDGES)
    assert pg.find_file_by_suffix("B.tsx") == "file:/B.tsx"
    assert pg.find_file_by_suffix("nope.tsx") is None


def test_analysis_summary():
    pg = ProjectGraph(NODES, EDGES)
    s = pg.analysis_summary()
    # C 影响面最大(2: A,B)
    assert s["maxImpactFile"] == "file:/C.tsx"
    assert s["maxImpactCount"] == 2


def test_cycle_safe():
    # A->B->A 环
    nodes = [{"id": "file:/A", "type": "File", "path": "/A"},
             {"id": "file:/B", "type": "File", "path": "/B"}]
    edges = [{"type": "IMPORTS", "from": "file:/A", "to": "file:/B"},
             {"type": "IMPORTS", "from": "file:/B", "to": "file:/A"}]
    pg = ProjectGraph(nodes, edges)
    assert pg.dependencies_of("file:/A") == ["file:/B"]  # 去重，不死循环
