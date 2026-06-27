from typing import TypedDict


class RunState(TypedDict):
    intent: str
    projectId: str
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
