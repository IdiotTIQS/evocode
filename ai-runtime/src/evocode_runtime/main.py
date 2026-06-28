import json
from collections.abc import Iterator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
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


# ── SSE 流式端点 ────────────────────────────────────────────────────────────
# 与上方 POST 端点共享同一图与中断语义（批准前零落盘），但逐节点推送进度。
# 帧格式：标准 SSE，每个事件一行 `data: {json}\n\n`。

def _sse(events: Iterator[dict]) -> Iterator[str]:
    for ev in events:
        yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


@app.post("/runs/stream")
def create_run_stream(req: IntentRequest) -> StreamingResponse:
    """提交意图，逐节点流式推进度，停在 plan gate。"""
    return StreamingResponse(
        _sse(_run_service.plan_stream(req.intent, req.project_id, req.repo_path or "")),
        media_type="text/event-stream", headers=_SSE_HEADERS)


@app.post("/runs/{run_id}/resume/stream")
def resume_run_stream(run_id: str) -> StreamingResponse:
    """批准后流式续跑，逐节点推进度，停在下一个门或完成。"""
    return StreamingResponse(
        _sse(_run_service.resume_stream(run_id)),
        media_type="text/event-stream", headers=_SSE_HEADERS)
