from evocode_runtime.llm.prompts import load_prompt


def test_load_prompt_reads_planner_markdown():
    text = load_prompt("planner-prompt")
    assert isinstance(text, str)
    assert len(text) > 0  # docs/prompts/planner-prompt.md exists and is non-empty


def test_load_prompt_missing_returns_empty_string():
    assert load_prompt("does-not-exist-prompt") == ""
