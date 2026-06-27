import os
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway
from evocode_runtime.pkg import TsExtractor, ProjectGraph, ExtractionError

_PLACEHOLDER_STATS = {"fileCount": 0, "componentCount": 0, "importCount": 0}


def understand_node(state: RunState) -> dict:
    repo_path = state.get("repoPath") or ""
    if repo_path and os.path.isdir(repo_path):
        extractor = TsExtractor()
        if extractor.is_available():
            try:
                raw = extractor.extract(repo_path)
                pg = ProjectGraph(raw["nodes"], raw["edges"])
                return {"context": pg.to_context(state["projectId"]), "phase": "understood"}
            except ExtractionError:
                pass
    return {
        "context": {"projectId": state["projectId"],
                    "graph": {"nodes": [], "edges": []},
                    "stats": dict(_PLACEHOLDER_STATS)},
        "phase": "understood",
    }


def plan_node(state: RunState) -> dict:
    gateway = get_llm_gateway()
    tasks = gateway.plan(state["intent"], state.get("context") or {})
    return {"tasks": [t.model_dump() for t in tasks], "phase": "planned"}
