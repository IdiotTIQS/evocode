"""架构师智能体（确定性）：在 plan 之后、generate 之前运行。

读取知识图谱，为每个任务产出 ArchitectureNotes：文件落点、要遵循的命名模式、
影响面警告、硬约束。无 LLM、无凭证；相同输入产出相同结果。
对应文档 docs/agents/architect-agent.md。
"""
import os
import re

from evocode_runtime.models import ArchitectureNotes
from evocode_runtime.pkg import ProjectGraph

# 各任务类型的默认落点（无现有约定可循时使用）
_DEFAULT_DIR = {
    "frontend": "evocode_generated/components",
    "backend": "evocode_generated/backend",
    "test": "evocode_generated/tests",
    "generic": "evocode_generated",
}


def _observed_component_dir(graph: ProjectGraph) -> str | None:
    """从现有 File 节点推断组件目录（取出现最多的 .tsx 父目录）。"""
    counts: dict[str, int] = {}
    for f in graph.files():
        path = str(f.get("path", ""))
        if path.endswith(".tsx") or path.endswith(".jsx"):
            d = os.path.dirname(path)
            if d:
                counts[d] = counts.get(d, 0) + 1
    if not counts:
        return None
    return max(counts, key=lambda d: (counts[d], d))


def _slug(text: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", text or "")
    return "".join(w.capitalize() for w in words[:3]) or "Feature"


def analyze_tasks(tasks: list[dict], context: dict) -> list[dict]:
    """为每个任务产出一条序列化的 ArchitectureNotes（by_alias）。"""
    graph_data = (context or {}).get("graph") or {"nodes": [], "edges": []}
    graph = ProjectGraph(graph_data.get("nodes", []), graph_data.get("edges", []))
    stats = (context or {}).get("stats") or {}
    max_impact = stats.get("maxImpactCount", 0)
    comp_dir = _observed_component_dir(graph)
    comp_names = [c.get("name") for c in graph.components() if c.get("name")]

    notes: list[dict] = []
    for task in tasks:
        kind = task.get("kind", "generic")
        name = _slug(task.get("title") or task.get("description"))
        # 文件落点：前端优先复用观察到的组件目录
        if kind == "frontend" and comp_dir:
            location = f"{comp_dir}/{name}.tsx"
        else:
            ext = {"frontend": "tsx", "backend": "java", "test": "test.ts"}.get(kind, "md")
            location = f"{_DEFAULT_DIR.get(kind, 'evocode_generated')}/{name}.{ext}"

        patterns: list[str] = []
        constraints: list[str] = []
        if comp_names:
            patterns.append(f"沿用现有组件命名风格（如 {', '.join(comp_names[:3])}）")
        if comp_dir:
            patterns.append(f"组件放置于 {comp_dir}/ 目录")
            constraints.append(f"必须与现有 {len(comp_names)} 个组件保持目录与命名一致")
        if kind == "backend":
            patterns.append("RESTful 资源命名，@RestController + @RequestMapping")

        warning = None
        if max_impact and max_impact >= 1:
            warning = f"该项目最大影响面为 {max_impact} 个文件，修改既有组件前需评估波及范围"
            constraints.append("最小化改动：优先新增而非重写既有文件")

        note = ArchitectureNotes(
            task_id=task.get("id", ""),
            file_locations={"primary": location},
            existing_to_extend=[],
            patterns_to_follow=patterns,
            impact_warning=warning,
            constraints=constraints,
        )
        notes.append(note.model_dump(by_alias=True))
    return notes
