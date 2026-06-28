from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
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
    # 用 MemorySaver：checkpoint 按 thread_id=run_id 在进程内跨 HTTP 请求持有。
    # TODO(backend): 换持久化 checkpointer（如 SqliteSaver）以扛进程重启——
    #   当前待批准 run 的 checkpoint 在内存，运行时重启会丢失。
    return builder.compile(
        checkpointer=MemorySaver(),
        interrupt_before=["generate", "apply"],
    )
