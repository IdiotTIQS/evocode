class ProjectGraph:
    """内存项目知识图谱：File/Component 节点 + IMPORTS/DEFINES 边的结构查询。"""

    def __init__(self, nodes: list[dict], edges: list[dict]) -> None:
        self._nodes = nodes
        self._edges = edges

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

    def to_context(self, project_id: str) -> dict:
        return {
            "projectId": project_id,
            "graph": {"nodes": self._nodes, "edges": self._edges},
            "stats": self.stats(),
        }
