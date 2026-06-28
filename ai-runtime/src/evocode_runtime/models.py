from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")
    repo_path: str | None = Field(default=None, alias="repoPath")


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
    status: Literal["completed", "failed"]
    phase: str
    task_graph: TaskGraph = Field(alias="taskGraph")
    message: str
    graph_stats: "ProjectGraphStats | None" = Field(default=None, alias="graphStats")
    change_set: list[ChangeFile] = Field(default_factory=list, alias="changeSet")
    applied_files: list[str] = Field(default_factory=list, alias="appliedFiles")
    verification: "VerificationResult | None" = Field(default=None)

    model_config = ConfigDict(populate_by_name=True)
