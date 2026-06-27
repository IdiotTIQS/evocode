from fastapi.testclient import TestClient
from evocode_runtime.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_run_returns_taskgraph():
    resp = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["runId"]
    assert "taskGraph" in body
    assert len(body["taskGraph"]["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in body["taskGraph"]["tasks"])
