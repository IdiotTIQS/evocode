import logging
import os
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway
from evocode_runtime.pkg import TsExtractor, ProjectGraph, ExtractionError
from evocode_runtime.pkg import SqliteGraphStore, compute_fingerprint

logger = logging.getLogger(__name__)

_PLACEHOLDER_STATS = {"fileCount": 0, "componentCount": 0, "importCount": 0,
                      "cacheHit": False, "graphVersionId": None, "maxImpactCount": 0}


def _db_path() -> str:
    return os.environ.get(
        "EVOCODE_PKG_DB",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "pkg.db"))


def _placeholder(project_id: str) -> dict:
    return {"context": {"projectId": project_id,
                        "graph": {"nodes": [], "edges": []},
                        "stats": dict(_PLACEHOLDER_STATS)},
            "phase": "understood"}


def understand_node(state: RunState) -> dict:
    repo_path = state.get("repoPath") or ""
    project_id = state["projectId"]
    if not (repo_path and os.path.isdir(repo_path)):
        return _placeholder(project_id)
    extractor = TsExtractor()
    if not extractor.is_available():
        return _placeholder(project_id)
    try:
        fp = compute_fingerprint(repo_path)
        store = None
        try:
            store = SqliteGraphStore(_db_path())
            vid = store.find_active_version(project_id, repo_path, fp)
        except Exception:  # noqa: BLE001  DB 不可用 → 退化为不缓存
            store, vid = None, None
        if store is not None and vid is not None:
            try:
                graph = store.load_graph(vid)
                pg = ProjectGraph(graph["nodes"], graph["edges"])
                summary = pg.analysis_summary()
                return {"context": pg.to_context(project_id,
                            {"cacheHit": True, "graphVersionId": vid,
                             "maxImpactCount": summary["maxImpactCount"]}),
                        "phase": "understood"}
            except Exception:  # noqa: BLE001  缓存命中但读取失败 → 退化为重新抽取
                logger.warning("understand_node: load_graph failed for project %s vid %s, falling through to extraction",
                               project_id, vid)
                # fall through to extract path below
        # miss or load failure: extract
        raw = extractor.extract(repo_path)
        new_vid = None
        if store is not None:
            try:
                new_vid = store.store_version(project_id, repo_path, fp, raw)
            except Exception:  # noqa: BLE001  存失败不影响本次结果
                new_vid = None
        pg = ProjectGraph(raw["nodes"], raw["edges"])
        summary = pg.analysis_summary()
        return {"context": pg.to_context(project_id,
                    {"cacheHit": False, "graphVersionId": new_vid,
                     "maxImpactCount": summary["maxImpactCount"]}),
                "phase": "understood"}
    except ExtractionError:
        return _placeholder(project_id)
    except Exception:  # noqa: BLE001  任何意外 → 占位，绝不让 /runs 失败
        logger.exception("understand_node failed for project %s, falling back to placeholder", project_id)
        return _placeholder(project_id)


def plan_node(state: RunState) -> dict:
    gateway = get_llm_gateway()
    tasks = gateway.plan(state["intent"], state.get("context") or {})
    return {"tasks": [t.model_dump() for t in tasks], "phase": "planned"}
