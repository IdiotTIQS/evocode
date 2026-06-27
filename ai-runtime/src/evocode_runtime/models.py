from uuid import uuid4
from pydantic import BaseModel, Field, ConfigDict


class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")


class RunAcknowledgement(BaseModel):
    run_id: str = Field(alias="runId")
    status: str
    message: str

    @staticmethod
    def accept(message: str = "Intent accepted") -> "RunAcknowledgement":
        return RunAcknowledgement(runId=str(uuid4()), status="accepted", message=message)
