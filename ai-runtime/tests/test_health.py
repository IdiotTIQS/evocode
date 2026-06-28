from fastapi.testclient import TestClient
from evocode_runtime.main import app
import json

client = TestClient(app)


def _parse_sse(text: str) -> list[dict]:
    return [json.loads(line[len("data: "):])
            for line in text.splitlines() if line.startswith("data: ")]


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_stream_endpoint_emits_sse_frames_to_plan_gate():
    """POST /runs/stream 返回 text/event-stream，逐节点帧 + 终帧 gate(plan)。"""
    resp = client.post("/runs/stream",
                       json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(resp.text)
    assert events[0]["type"] == "run" and events[0]["runId"]
    assert [e["node"] for e in events if e["type"] == "phase"] == \
        ["understand", "plan", "architect"]
    assert events[-1]["type"] == "gate"
    assert events[-1]["result"]["gate"] == "plan"


def test_resume_stream_endpoint_walks_to_done():
    created = client.post("/runs/stream",
                         json={"intent": "add a contact page", "projectId": "demo"})
    run_id = _parse_sse(created.text)[0]["runId"]

    diff = _parse_sse(client.post(f"/runs/{run_id}/resume/stream").text)
    assert diff[-1]["type"] == "gate" and diff[-1]["result"]["gate"] == "diff"

    done = _parse_sse(client.post(f"/runs/{run_id}/resume/stream").text)
    assert done[-1]["type"] == "done"
    assert done[-1]["result"]["status"] == "completed"

def test_create_run_stops_at_plan_gate():
    """POST /runs 提交意图后停在 plan gate：waiting_approval，无生成物。"""
    resp = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "waiting_approval"
    assert body["gate"] == "plan"
    assert body["runId"]
    assert "taskGraph" in body
    assert len(body["taskGraph"]["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in body["taskGraph"]["tasks"])
    assert body["changeSet"] == []


def test_resume_walks_through_gates_to_completed():
    """POST /runs/{id}/resume 两次：plan gate → diff gate → completed。"""
    created = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"}).json()
    run_id = created["runId"]

    diff = client.post(f"/runs/{run_id}/resume").json()
    assert diff["status"] == "waiting_approval"
    assert diff["gate"] == "diff"
    assert len(diff["changeSet"]) >= 1

    final = client.post(f"/runs/{run_id}/resume").json()
    assert final["status"] == "completed"
    assert final["gate"] is None


def test_resume_unknown_run_returns_404():
    resp = client.post("/runs/does-not-exist/resume")
    assert resp.status_code == 404
