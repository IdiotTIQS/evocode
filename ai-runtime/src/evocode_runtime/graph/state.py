from typing import TypedDict


class RunState(TypedDict):
    intent: str
    projectId: str
    repoPath: str  # 空串表示未提供
    history: list  # list[dict]: {role, text} 多轮对话历史
    priorChangeSet: list  # list[dict]: {path, content} 本会话已有文件（迭代编辑基线）
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
    architectureNotes: list  # list[dict]，序列化的 ArchitectureNotes（每任务一条）
    changeSet: list  # list[dict]: {path, content} 生成的文件
    applied: list  # list[str]: 已写入的绝对路径
    verification: dict  # {checked, passed, diagnosticCount, diagnostics}
    review: dict  # {verdict, findings, summary} 审查裁定
