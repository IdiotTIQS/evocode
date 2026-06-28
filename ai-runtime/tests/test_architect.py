from evocode_runtime.agents.architect import analyze_tasks
from evocode_runtime.graph.nodes import architect_node


_CTX = {
    "projectId": "demo",
    "graph": {
        "nodes": [
            {"id": "f1", "type": "File", "path": "components/Button.tsx"},
            {"id": "f2", "type": "File", "path": "components/Card.tsx"},
            {"id": "c1", "type": "Component", "name": "Button"},
            {"id": "c2", "type": "Component", "name": "Card"},
        ],
        "edges": [
            {"type": "DEFINES", "from": "f1", "to": "c1"},
            {"type": "DEFINES", "from": "f2", "to": "c2"},
            {"type": "IMPORTS", "from": "f2", "to": "f1"},
        ],
    },
    # stats 是 context 的顶层键，与 to_context() 实际产出的结构保持一致
    "stats": {"fileCount": 2, "componentCount": 2, "importCount": 1, "maxImpactCount": 1},
}


def test_analyze_assigns_file_location_for_frontend_task():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    notes = analyze_tasks(tasks, _CTX)
    assert len(notes) == 1
    n = notes[0]
    assert n["taskId"] == "task-1"
    # 前端任务的文件位置应落在已观察到的 components/ 目录
    assert any(p.endswith(".tsx") and "components/" in p for p in n["fileLocations"].values())
    # 应从现有组件命名推断出模式约束
    assert any("component" in s.lower() or "组件" in s for s in n["patternsToFollow"])


def test_analyze_emits_impact_warning_when_extending_existing_file():
    # Card.tsx 被 1 个文件依赖；后端任务无前端影响，前端任务命中已有组件目录
    tasks = [{"id": "task-1", "title": "卡片增强", "kind": "frontend", "description": "改 card"}]
    notes = analyze_tasks(tasks, _CTX)
    # 有影响面统计时，constraints 一定非空（必须遵循现有约定）
    assert notes[0]["constraints"]
    # maxImpactCount=1 时 impactWarning 必须是非空字符串
    assert notes[0]["impactWarning"]


def test_architect_node_never_fails_on_empty_context():
    state = {"tasks": [{"id": "task-1", "title": "x", "kind": "generic", "description": "y"}],
             "context": {}}
    out = architect_node(state)
    assert out["phase"] == "architected"
    assert isinstance(out["architectureNotes"], list)
    assert out["architectureNotes"][0]["taskId"] == "task-1"


def test_architect_node_handles_no_tasks():
    out = architect_node({"tasks": [], "context": _CTX})
    assert out["architectureNotes"] == []
    assert out["phase"] == "architected"
