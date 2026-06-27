from evocode_runtime.graph import build_graph


def test_graph_produces_taskgraph():
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-thread-1"}}
    result = graph.invoke(
        {"intent": "add a contact page", "projectId": "demo",
         "context": {}, "phase": "", "tasks": [],
         "changeSet": [], "applied": [], "verification": {}},
        config=config)
    # 流水线终态：understand→plan→generate→verify
    assert result["phase"] == "verified"
    assert len(result["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in result["tasks"])
    # generate 阶段产出了真实文件内容
    assert len(result["changeSet"]) >= 1
    assert any(f["path"].endswith(".tsx") for f in result["changeSet"])
