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


def test_checkpoint_survives_graph_rebuild():
    """持久化 checkpointer：第一个图实例把 run 停在 plan gate 后，用全新 build_graph()
    实例（模拟进程重启，共享同一 SQLite 文件）仍能读到 checkpoint 并 resume 续跑。"""
    thread = "persist-thread-1"
    config = {"configurable": {"thread_id": thread}}

    # 实例 A：提交意图，停在 plan gate。
    graph_a = build_graph()
    graph_a.invoke(
        {"intent": "add a contact page", "projectId": "demo",
         "context": {}, "phase": "", "tasks": [],
         "changeSet": [], "applied": [], "verification": {}},
        config=config)
    assert "generate" in graph_a.get_state(config).next

    # 实例 B：全新构建（新 SqliteSaver 连接，同一 DB 文件）——能看到待批准状态。
    graph_b = build_graph()
    sb = graph_b.get_state(config)
    assert sb.created_at, "重建实例应能从持久化 checkpoint 读到该 run"
    assert "generate" in sb.next
    assert sb.values["phase"] == "architected"

    # 实例 B resume：越过 generate 门到 diff gate，证明可继续。
    graph_b.invoke(None, config=config)
    assert "apply" in graph_b.get_state(config).next
