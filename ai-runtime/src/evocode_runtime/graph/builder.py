import os
import sqlite3

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from evocode_runtime.graph.state import RunState
from evocode_runtime.graph.nodes import (
    understand_node,
    plan_node,
    architect_node,
    generate_node,
    verify_node,
    review_node,
    apply_node,
)


def _checkpoint_db_path() -> str:
    """审批门 checkpoint 的 SQLite 路径。默认 ai-runtime/data/checkpoints.db，
    可经 EVOCODE_CHECKPOINT_DB 覆盖（如测试用临时文件 / :memory:）。"""
    default = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "data", "checkpoints.db")
    return os.environ.get("EVOCODE_CHECKPOINT_DB", default)


def _make_checkpointer() -> SqliteSaver:
    """构造进程内长生命周期的 SqliteSaver。

    直接持有 sqlite3.Connection（绕过 from_conn_string 的 context-manager 用法），
    使 checkpoint 跨 HTTP 请求且跨进程重启持久化——待批准的 run 重启后仍可 resume。
    check_same_thread=False：uvicorn 在不同线程处理请求。"""
    path = _checkpoint_db_path()
    if path != ":memory:":
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    saver = SqliteSaver(conn)
    saver.setup()  # 幂等建表
    return saver


def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_node("architect", architect_node)
    builder.add_node("generate", generate_node)
    builder.add_node("verify", verify_node)
    builder.add_node("review", review_node)
    builder.add_node("apply", apply_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", "architect")
    builder.add_edge("architect", "generate")
    builder.add_edge("generate", "verify")
    builder.add_edge("verify", "review")
    builder.add_edge("review", "apply")
    builder.add_edge("apply", END)
    # 两个真实审批门：图在 generate / apply 前自动中断，等待 resume 才越过。
    #   interrupt_before=["generate"] → 规划完成后暂停（plan gate，磁盘零写入）
    #   interrupt_before=["apply"]    → 生成 changeSet 后暂停（diff gate，磁盘仍零写入）
    # 用 SqliteSaver：checkpoint 按 thread_id=run_id 持久化到磁盘，跨 HTTP 请求且
    # 跨进程重启存活——运行时重启后待批准的 run 仍可继续。
    return builder.compile(
        checkpointer=_make_checkpointer(),
        interrupt_before=["generate", "apply"],
    )
