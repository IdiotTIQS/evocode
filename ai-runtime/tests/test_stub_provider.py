from evocode_runtime.llm.stub_provider import StubLlmProvider


def test_page_intent_yields_frontend_task():
    tasks = StubLlmProvider().plan("add a contact page", {})
    kinds = [t.kind for t in tasks]
    assert "frontend" in kinds
    assert "test" in kinds  # 总有 test 任务


def test_api_intent_yields_backend_task():
    tasks = StubLlmProvider().plan("add a comments api endpoint", {})
    kinds = [t.kind for t in tasks]
    assert "backend" in kinds
    assert "test" in kinds


def test_generic_fallback():
    tasks = StubLlmProvider().plan("improve performance", {})
    kinds = [t.kind for t in tasks]
    assert "generic" in kinds
    assert "test" in kinds


def test_deterministic():
    a = StubLlmProvider().plan("add a page and an api", {})
    b = StubLlmProvider().plan("add a page and an api", {})
    assert [t.model_dump() for t in a] == [t.model_dump() for t in b]
