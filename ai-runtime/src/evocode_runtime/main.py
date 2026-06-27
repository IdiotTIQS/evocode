from fastapi import FastAPI
from evocode_runtime.models import IntentRequest, RunResult
from evocode_runtime.run_service import RunService

app = FastAPI(title="EvoCode AI Runtime", version="0.1.0")
_run_service = RunService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunResult, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunResult:
    return _run_service.execute(req.intent, req.project_id)
