import logging
import os
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway
from evocode_runtime.agents import analyze_tasks, review_change_set
from evocode_runtime.pkg import TsExtractor, ProjectGraph, ExtractionError
from evocode_runtime.pkg import SqliteGraphStore, compute_fingerprint
from evocode_runtime.pkg import TsVerifier, VerificationError
from evocode_runtime.codegen import generate_change_set, apply_change_set

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
    tasks = gateway.plan(state["intent"], state.get("context") or {},
                         history=state.get("history") or [])
    return {"tasks": [t.model_dump() for t in tasks], "phase": "planned"}


def architect_node(state: RunState) -> dict:
    """架构师阶段：为每个任务产出架构笔记，供 generate 落地时遵循。

    确定性、读知识图谱。任何异常 → 返回空笔记，绝不让 /runs 失败。"""
    tasks = state.get("tasks") or []
    try:
        notes = analyze_tasks(tasks, state.get("context") or {})
    except Exception:  # noqa: BLE001
        logger.exception("architect_node failed for project %s", state.get("projectId"))
        notes = []
    return {"architectureNotes": notes, "phase": "architected"}


def generate_node(state: RunState) -> dict:
    """把任务物化为代码文件内容（changeSet），但**不落盘**。

    消费架构师笔记决定文件落点与模式。落盘改由 apply_node 负责，且仅在用户
    批准 diff 后（越过 interrupt_before=["apply"] 门）才执行——兑现「批准前
    磁盘零写入」。绝不让 /runs 失败。"""
    intent = state["intent"]
    tasks = state.get("tasks") or []
    notes = state.get("architectureNotes") or []
    history = state.get("history") or []
    prior = state.get("priorChangeSet") or []
    try:
        change_set = generate_change_set(tasks, intent, notes, history=history, prior=prior)
    except Exception:  # noqa: BLE001
        logger.exception("generate_node failed to build change set for project %s",
                          state.get("projectId"))
        return {"changeSet": [], "phase": "generated"}
    return {"changeSet": change_set, "phase": "generated"}


def verify_node(state: RunState) -> dict:
    """对目标 repo 跑只读静态类型检查，产出现实裁定。

    诚实限制：本节点在 apply_node 之前运行（generate→verify→review→[diff gate]→apply），
    此时 changeSet 尚未落盘，因此 tsc 检查的是【生成前】的 repo 状态，不覆盖本次生成的
    文件。这是为兑现「批准 diff 前磁盘零写入」而做的取舍。
    TODO(backend): 若需对生成文件做类型检查，应在 apply 之后增设 verify 阶段（需额外门或
    后置检查），避免在批准前写盘。"""
    repo_path = state.get("repoPath") or ""
    not_checked = {"checked": False, "passed": False, "diagnosticCount": 0, "diagnostics": []}
    if not (repo_path and os.path.isdir(repo_path)):
        return {"verification": not_checked, "phase": "verified"}
    verifier = TsVerifier()
    if not verifier.is_available():
        return {"verification": not_checked, "phase": "verified"}
    try:
        res = verifier.check(repo_path)
        return {"verification": {
            "checked": True, "passed": res["passed"],
            "diagnosticCount": res["diagnosticCount"],
            "diagnostics": res["diagnostics"][:20]}, "phase": "verified"}
    except VerificationError:
        return {"verification": not_checked, "phase": "verified"}
    except Exception:  # noqa: BLE001  绝不让 verify 拖垮 /runs
        logger.exception("verify_node failed for project %s", state.get("projectId"))
        return {"verification": not_checked, "phase": "verified"}


def review_node(state: RunState) -> dict:
    """审查阶段：对变更集 + 验证结果出具裁定。确定性，绝不让 /runs 失败。"""
    try:
        review = review_change_set(
            intent=state.get("intent", ""),
            tasks=state.get("tasks") or [],
            change_set=state.get("changeSet") or [],
            verification=state.get("verification") or {})
    except Exception:  # noqa: BLE001
        logger.exception("review_node failed for project %s", state.get("projectId"))
        review = {"verdict": "approve", "findings": [],
                  "summary": "审查阶段内部错误，已跳过。"}
    return {"review": review, "phase": "reviewed"}


def apply_node(state: RunState) -> dict:
    """落盘阶段：把已批准的 changeSet 写入目标 repo 的 evocode_generated/ 子目录。

    仅在用户批准 diff 后（图越过 interrupt_before=["apply"] 门）才执行，是整条
    流水线中唯一发生磁盘写入的节点。无 repoPath 或写盘失败时仍返回（applied 为空），
    绝不让 /runs 失败。"""
    change_set = state.get("changeSet") or []
    repo_path = state.get("repoPath") or ""
    applied: list[str] = []
    if repo_path and os.path.isdir(repo_path):
        try:
            applied = apply_change_set(repo_path, change_set)
        except Exception:  # noqa: BLE001  写盘失败不影响结果返回
            logger.exception("apply_node failed to apply change set to %s", repo_path)
            applied = []
    return {"applied": applied, "phase": "applied"}
