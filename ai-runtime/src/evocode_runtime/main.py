from fastapi import FastAPI, HTTPException
from evocode_runtime.models import IntentRequest, RunResult
from evocode_runtime.run_service import RunService

app = FastAPI(title="EvoCode AI Runtime", version="0.1.0")
_run_service = RunService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunResult, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunResult:
    """提交意图：跑到 plan gate 即真实中断，返回 waiting_approval（磁盘零写入）。"""
    return _run_service.plan(req.intent, req.project_id, req.repo_path or "")


@app.post("/runs/{run_id}/resume", response_model=RunResult, response_model_by_alias=True)
def resume_run(run_id: str) -> RunResult:
    """批准后续跑：从 checkpoint 越过当前门到下一个门或完成。

    run_id 无对应 checkpoint（未知或已回收）→ 404。"""
    result = _run_service.resume(run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="run not found or no pending checkpoint")
    return result
