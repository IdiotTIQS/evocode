from fastapi import FastAPI
from evocode_runtime.models import IntentRequest, RunAcknowledgement

app = FastAPI(title="EvoCode AI Runtime", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunAcknowledgement, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunAcknowledgement:
    # 增量 0：桩化确认。真实演化事务后续接入 services 层。
    return RunAcknowledgement.accept(f"Run accepted for project {req.project_id}")
