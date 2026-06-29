from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class ConversationTurn(BaseModel):
    """一轮历史消息（多轮对话上下文）。"""
    role: str  # "user" | "agent"
    text: str


class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")
    repo_path: str | None = Field(default=None, alias="repoPath")
    # 控制平面层的会话关联；运行时不消费，仅声明以使契约显式（避免 payload 漂移被静默吞掉）。
    session_id: str | None = Field(default=None, alias="sessionId")
    # 多轮对话：本会话此前的消息历史，供 plan/generate 接续上下文。
    history: list[ConversationTurn] = Field(default_factory=list)
    # 迭代编辑：本会话已生成的文件（{path, content}），供 generate 在其基础上改写。
    prior_change_set: list["ChangeFile"] = Field(
        default_factory=list, alias="priorChangeSet")

    # 控制平面可能传 null（Java 的 null List）——统一归一化为空列表，避免 422。
    @field_validator("history", "prior_change_set", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return v or []



class EngineeringTask(BaseModel):
    id: str
    title: str
    kind: Literal["frontend", "backend", "test", "generic"]
    description: str


class Abstraction(BaseModel):
    name: str
    kind: str  # interface/type/class/component
    description: str


class ArchitectureNotes(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    task_id: str = Field(alias="taskId")
    file_locations: dict[str, str] = Field(default_factory=dict, alias="fileLocations")
    new_abstractions: list[Abstraction] = Field(default_factory=list, alias="newAbstractions")
    existing_to_extend: list[str] = Field(default_factory=list, alias="existingToExtend")
    patterns_to_follow: list[str] = Field(default_factory=list, alias="patternsToFollow")
    impact_warning: str | None = Field(default=None, alias="impactWarning")
    constraints: list[str] = Field(default_factory=list)


class TaskGraph(BaseModel):
    tasks: list[EngineeringTask] = Field(default_factory=list)


class ProjectGraphStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    file_count: int = Field(alias="fileCount")
    component_count: int = Field(alias="componentCount")
    import_count: int = Field(alias="importCount")
    cache_hit: bool = Field(default=False, alias="cacheHit")
    graph_version_id: int | None = Field(default=None, alias="graphVersionId")
    max_impact_count: int = Field(default=0, alias="maxImpactCount")


class ChangeFile(BaseModel):
    path: str
    content: str


class Diagnostic(BaseModel):
    file: str
    line: int | None = None
    code: int
    message: str


class VerificationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    checked: bool = False
    passed: bool = False
    diagnostic_count: int = Field(default=0, alias="diagnosticCount")
    diagnostics: list[Diagnostic] = Field(default_factory=list)


class ReviewFinding(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    severity: Literal["critical", "major", "minor", "suggestion"]
    file_path: str = Field(alias="filePath")
    message: str
    suggested_fix: str | None = Field(default=None, alias="suggestedFix")


class ReviewOutput(BaseModel):
    verdict: Literal["approve", "request_changes", "block"]
    findings: list[ReviewFinding] = Field(default_factory=list)
    summary: str


class RunResult(BaseModel):
    run_id: str = Field(alias="runId")
    # waiting_approval：图已在某个审批门前真实中断（checkpoint 持有，未越过该门）。
    status: Literal["waiting_approval", "completed", "failed"]
    phase: str
    # 当 status == waiting_approval 时指明卡在哪个门：
    #   "plan" → 已规划，等待批准后才生成代码（磁盘零写入）
    #   "diff" → 已生成 changeSet，等待批准后才落盘（磁盘仍零写入）
    # 其余状态为 None。
    gate: "Literal['plan', 'diff'] | None" = Field(default=None)
    task_graph: TaskGraph = Field(alias="taskGraph")
    message: str
    graph_stats: "ProjectGraphStats | None" = Field(default=None, alias="graphStats")
    change_set: list[ChangeFile] = Field(default_factory=list, alias="changeSet")
    applied_files: list[str] = Field(default_factory=list, alias="appliedFiles")
    verification: "VerificationResult | None" = Field(default=None)
    review: "ReviewOutput | None" = Field(default=None)

    model_config = ConfigDict(populate_by_name=True)


# IntentRequest 前向引用了下方定义的 ChangeFile，显式 rebuild 以解析。
IntentRequest.model_rebuild()
