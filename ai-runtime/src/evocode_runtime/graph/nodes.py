from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway


def understand_node(state: RunState) -> dict:
    # 增量 1：占位 context（回显 projectId，空图结构）。真实 PKG 抽取后续增量。
    return {
        "context": {"projectId": state["projectId"], "graph": {"nodes": [], "edges": []}},
        "phase": "understood",
    }


def plan_node(state: RunState) -> dict:
    gateway = get_llm_gateway()
    tasks = gateway.plan(state["intent"], state.get("context") or {})
    return {
        "tasks": [t.model_dump() for t in tasks],
        "phase": "planned",
    }
