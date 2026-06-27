from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")


class EngineeringTask(BaseModel):
    id: str
    title: str
    kind: Literal["frontend", "backend", "test", "generic"]
    description: str


class TaskGraph(BaseModel):
    tasks: list[EngineeringTask] = Field(default_factory=list)


class RunResult(BaseModel):
    run_id: str = Field(alias="runId")
    status: Literal["completed", "failed"]
    phase: str
    task_graph: TaskGraph = Field(alias="taskGraph")
    message: str

    model_config = ConfigDict(populate_by_name=True)
