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
)


def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_node("architect", architect_node)
    builder.add_node("generate", generate_node)
    builder.add_node("verify", verify_node)
    builder.add_node("review", review_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", "architect")
    builder.add_edge("architect", "generate")
    builder.add_edge("generate", "verify")
    builder.add_edge("verify", "review")
    builder.add_edge("review", END)
    return builder.compile(checkpointer=MemorySaver())
