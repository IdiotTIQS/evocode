from evocode_runtime.graph import build_graph


def test_graph_produces_taskgraph():
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-thread-1"}}
    result = graph.invoke(
        {"intent": "add a contact page", "projectId": "demo",
         "context": {}, "phase": "", "tasks": []},
        config=config)
    assert result["phase"] == "planned"
    assert len(result["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in result["tasks"])
