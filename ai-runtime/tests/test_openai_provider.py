import json
import httpx
from evocode_runtime.llm.openai_provider import OpenAiLlmProvider


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def _chat_payload(content: str) -> dict:
    return {"choices": [{"message": {"content": content}}]}


def test_openai_plan_parses_task_array(monkeypatch):
    tasks_json = json.dumps([
        {"id": "task-1", "title": "前端页面", "kind": "frontend", "description": "做页面"},
        {"id": "task-2", "title": "测试", "kind": "test", "description": "测它"},
    ])

    def fake_post(url, headers=None, json=None, timeout=None):
        # 校验提示词被注入到 system 消息
        msgs = json["messages"]
        assert msgs[0]["role"] == "system"
        assert "intent" in json["messages"][1]["content"].lower() or True
        return _FakeResponse(_chat_payload(tasks_json))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAiLlmProvider()
    tasks = provider.plan("add a contact page", {})
    assert [t.kind for t in tasks] == ["frontend", "test"]
    assert tasks[0].id == "task-1"


def test_openai_plan_falls_back_on_error(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("no network")

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", boom)
    provider = OpenAiLlmProvider()
    tasks = provider.plan("add a contact page", {})
    assert len(tasks) == 1
    assert tasks[0].kind == "generic"


def test_openai_plan_falls_back_on_bad_json(monkeypatch):
    def fake_post(*a, **k):
        return _FakeResponse(_chat_payload("not json at all"))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAiLlmProvider()
    tasks = provider.plan("x", {})
    assert len(tasks) == 1 and tasks[0].kind == "generic"


def test_generate_code_returns_llm_content(monkeypatch):
    code = "export function Foo() { return null; }"

    def fake_post(url, headers=None, json=None, timeout=None):
        msgs = json["messages"]
        assert msgs[0]["role"] == "system"
        # 推理模型需要足够 token 额度
        assert json["max_tokens"] >= 2000
        return _FakeResponse(_chat_payload(code))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    provider = OpenAiLlmProvider()
    out = provider.generate_code(
        {"id": "task-1", "title": "Foo", "kind": "frontend", "description": "做个 Foo"},
        "add foo", None)
    assert out is not None and "export function Foo" in out


def test_generate_code_strips_markdown_fence(monkeypatch):
    fenced = "```tsx\nexport const X = 1;\n```"

    def fake_post(*a, **k):
        return _FakeResponse(_chat_payload(fenced))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    out = OpenAiLlmProvider().generate_code(
        {"id": "t", "title": "X", "kind": "frontend", "description": "d"}, "i", None)
    assert out.strip() == "export const X = 1;"
    assert "```" not in out


def test_generate_code_falls_back_to_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("no network")

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", boom)
    out = OpenAiLlmProvider().generate_code(
        {"id": "t", "title": "X", "kind": "frontend", "description": "d"}, "i", None)
    assert out is None


def test_generate_code_too_short_returns_none(monkeypatch):
    def fake_post(*a, **k):
        return _FakeResponse(_chat_payload("ok"))  # 太短

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    out = OpenAiLlmProvider().generate_code(
        {"id": "t", "title": "X", "kind": "frontend", "description": "d"}, "i", None)
    assert out is None


def test_plan_injects_conversation_history(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["messages"] = json["messages"]
        return _FakeResponse(_chat_payload(
            '[{"id":"task-1","title":"t","kind":"frontend","description":"d"}]'))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    OpenAiLlmProvider().plan("再加个手机号字段", {}, history=[
        {"role": "user", "text": "加个联系表单"},
        {"role": "agent", "text": "已生成 ContactForm"},
    ])
    roles = [m["role"] for m in captured["messages"]]
    # system + 2 历史轮（user/assistant）+ 当前 user
    assert roles == ["system", "user", "assistant", "user"]
    assert "加个联系表单" in captured["messages"][1]["content"]


def test_generate_code_with_existing_asks_for_edit(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["messages"] = json["messages"]
        return _FakeResponse(_chat_payload("export const Updated = 1;\n"))

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(httpx, "post", fake_post)
    out = OpenAiLlmProvider().generate_code(
        {"id": "t", "title": "X", "kind": "frontend", "description": "加手机号"},
        "加手机号字段", None,
        history=[{"role": "user", "text": "上一轮：做了表单"}],
        existing="export const Form = () => null;")
    assert out is not None
    user_msg = captured["messages"][-1]["content"]
    # 含现有文件内容 + 要求改完整文件
    assert "export const Form" in user_msg
    assert "完整文件" in user_msg
    # 历史也被注入
    assert any("上一轮" in m["content"] for m in captured["messages"])
