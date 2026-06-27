from collections import deque


class ProjectGraph:
    """内存项目知识图谱：File/Component 节点 + IMPORTS/DEFINES 边的结构查询。"""

    def __init__(self, nodes: list[dict], edges: list[dict]) -> None:
        self._nodes = nodes
        self._edges = edges
        # 预构建 IMPORTS 邻接（from 依赖 to）
        self._out: dict[str, list[str]] = {}   # from -> [to]
        self._in: dict[str, list[str]] = {}    # to -> [from]
        for e in edges:
            if e.get("type") == "IMPORTS":
                f, t = e.get("from"), e.get("to")
                self._out.setdefault(f, []).append(t)
                self._in.setdefault(t, []).append(f)

    def files(self) -> list[dict]:
        return [n for n in self._nodes if n.get("type") == "File"]

    def components(self) -> list[dict]:
        return [n for n in self._nodes if n.get("type") == "Component"]

    def imports_of(self, file_id: str) -> list[str]:
        return [e["to"] for e in self._edges
                if e.get("type") == "IMPORTS" and e.get("from") == file_id]

    def stats(self) -> dict:
        return {
            "fileCount": len(self.files()),
            "componentCount": len(self.components()),
            "importCount": sum(1 for e in self._edges if e.get("type") == "IMPORTS"),
        }

    def to_context(self, project_id: str, extra_stats: dict | None = None) -> dict:
        stats = self.stats()
        if extra_stats:
            stats.update(extra_stats)
        return {
            "projectId": project_id,
            "graph": {"nodes": self._nodes, "edges": self._edges},
            "stats": stats,
        }

    def _reachable(self, adj: dict[str, list[str]], start: str, max_depth: int | None) -> list[str]:
        visited: set[str] = {start}  # seed with start so it never appears in results
        queue: deque[tuple[str, int]] = deque((n, 1) for n in adj.get(start, []))
        while queue:
            node, depth = queue.popleft()
            if node in visited:
                continue
            visited.add(node)
            if max_depth is None or depth < max_depth:
                for nxt in adj.get(node, []):
                    if nxt not in visited:
                        queue.append((nxt, depth + 1))
        visited.discard(start)
        return sorted(visited)

    def dependencies_of(self, file_id: str, max_depth: int | None = None) -> list[str]:
        """file_id (传递) 依赖的文件（沿 IMPORTS 正向）。"""
        return self._reachable(self._out, file_id, max_depth)

    def impact_of(self, file_id: str, max_depth: int | None = None) -> list[str]:
        """改 file_id 会 (传递) 波及的文件（沿 IMPORTS 反向）。"""
        return self._reachable(self._in, file_id, max_depth)

    def components_in(self, file_id: str) -> list[dict]:
        defined = {e["to"] for e in self._edges
                   if e.get("type") == "DEFINES" and e.get("from") == file_id}
        return [n for n in self._nodes if n.get("id") in defined and n.get("type") == "Component"]

    def find_file_by_suffix(self, suffix: str) -> str | None:
        for n in self._nodes:
            if n.get("type") == "File" and str(n.get("path", "")).endswith(suffix):
                return n.get("id")
        return None

    def analysis_summary(self) -> dict:
        max_file, max_count = None, 0
        for n in self._nodes:
            if n.get("type") != "File":
                continue
            cnt = len(self.impact_of(n["id"]))
            if cnt > max_count:
                max_file, max_count = n["id"], cnt
        return {"maxImpactFile": max_file, "maxImpactCount": max_count}
