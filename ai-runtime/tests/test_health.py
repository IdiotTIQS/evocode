from fastapi.testclient import TestClient
from evocode_runtime.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


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
