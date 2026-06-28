from evocode_runtime.graph import build_graph


def test_graph_stops_at_plan_gate_then_resumes_to_completion():
    """图带 interrupt_before=["generate","apply"]：首次 invoke 停在 plan gate（architected），
    两次 resume（invoke(None)）依次越过 generate / apply 门跑到终态。"""
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-thread-1"}}

    # 1) 提交：停在 generate 前（plan gate）。
    graph.invoke(
        {"intent": "add a contact page", "projectId": "demo",
         "context": {}, "phase": "", "tasks": [],
         "changeSet": [], "applied": [], "verification": {}},
        config=config)
    s1 = graph.get_state(config)
    assert s1.values["phase"] == "architected"
    assert "generate" in s1.next
    assert len(s1.values["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in s1.values["tasks"])
    assert s1.values.get("changeSet") == []  # 批准前无生成物

    # 2) 批准计划：resume 到 apply 前（diff gate），有 changeSet 未落盘。
    graph.invoke(None, config=config)
    s2 = graph.get_state(config)
    assert "apply" in s2.next
    assert len(s2.values["changeSet"]) >= 1
    assert any(f["path"].endswith(".tsx") for f in s2.values["changeSet"])

    # 3) 批准 diff：resume 到终态。
    graph.invoke(None, config=config)
    s3 = graph.get_state(config)
    assert s3.values["phase"] == "applied"
    assert not s3.next  # 已完成
