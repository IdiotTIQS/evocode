from evocode_runtime.agents.review import review_change_set
from evocode_runtime.graph.nodes import review_node


def test_block_when_verification_failed():
    out = review_change_set(
        intent="x",
        tasks=[{"id": "task-1", "kind": "frontend"}],
        change_set=[{"path": "evocode_generated/components/A.tsx", "content": "ok"}],
        verification={"checked": True, "passed": False, "diagnosticCount": 2, "diagnostics": []})
    assert out["verdict"] == "block"
    assert any(f["severity"] == "critical" for f in out["findings"])


def test_request_changes_when_no_tests_generated():
    out = review_change_set(
        intent="add page",
        tasks=[{"id": "task-1", "kind": "frontend"}],
        change_set=[{"path": "evocode_generated/components/A.tsx", "content": "ok"}],
        verification={"checked": True, "passed": True, "diagnosticCount": 0, "diagnostics": []})
    # 没有测试文件 → major → request_changes
    assert out["verdict"] == "request_changes"
    assert any("test" in f["message"].lower() or "测试" in f["message"] for f in out["findings"])


def test_flags_hardcoded_secret_as_critical():
    out = review_change_set(
        intent="x",
        tasks=[{"id": "task-1", "kind": "backend"}, {"id": "task-2", "kind": "test"}],
        change_set=[
            {"path": "evocode_generated/backend/A.java",
             "content": 'String apiKey = "sk-ABCDEF1234567890";'},
            {"path": "evocode_generated/tests/A.test.ts", "content": "expect(1).toBe(1)"},
        ],
        verification={"checked": True, "passed": True, "diagnosticCount": 0, "diagnostics": []})
    assert out["verdict"] == "block"
    assert any(f["severity"] == "critical" and "secret" in f["message"].lower()
               or "密钥" in f["message"] for f in out["findings"])


def test_approve_clean_change_set_with_tests():
    out = review_change_set(
        intent="x",
        tasks=[{"id": "task-1", "kind": "frontend"}, {"id": "task-2", "kind": "test"}],
        change_set=[
            {"path": "evocode_generated/components/A.tsx", "content": "export const A = () => null;"},
            {"path": "evocode_generated/tests/A.test.ts", "content": "it('works', () => {})"},
        ],
        verification={"checked": True, "passed": True, "diagnosticCount": 0, "diagnostics": []})
    assert out["verdict"] == "approve"


def test_review_node_never_fails():
    out = review_node({"intent": "x", "tasks": [], "changeSet": [], "verification": {}})
    assert out["phase"] == "reviewed"
    assert out["review"]["verdict"] in {"approve", "request_changes", "block"}
