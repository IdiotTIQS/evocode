from typing import TypedDict


class RunState(TypedDict):
    intent: str
    projectId: str
    repoPath: str  # 空串表示未提供
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
