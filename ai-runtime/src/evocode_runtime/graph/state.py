from typing import TypedDict


class RunState(TypedDict):
    intent: str
    projectId: str
    repoPath: str  # 空串表示未提供
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
    architectureNotes: list  # list[dict]，序列化的 ArchitectureNotes（每任务一条）
    changeSet: list  # list[dict]: {path, content} 生成的文件
    applied: list  # list[str]: 已写入的绝对路径
    verification: dict  # {checked, passed, diagnosticCount, diagnostics}
