from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from evocode_runtime.graph.state import RunState
from evocode_runtime.graph.nodes import understand_node, plan_node


def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", END)
    return builder.compile(checkpointer=MemorySaver())
