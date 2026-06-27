from fastapi.testclient import TestClient
from evocode_runtime.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_run_returns_accepted():
    resp = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["runId"]
    assert "demo" in body["message"]
