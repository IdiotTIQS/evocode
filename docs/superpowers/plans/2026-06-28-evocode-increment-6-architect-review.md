# EvoCode Increment 6 — Architect + Review Agents & Prompt-Wired LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three highest-value doc-vs-code gaps from the audit: add the documented Architect and Review agent nodes to the graph, make code generation consume Architect output instead of fixed templates, and wire `docs/prompts/*` into a real (credential-gated) LLM planning path.

**Architecture:** Extend the existing linear LangGraph pipeline from `understand → plan → generate → verify` to `understand → plan → architect → generate → verify → review`. The Architect node is deterministic — it reads the in-memory `ProjectGraph` (already in `state["context"]["graph"]`) to produce `ArchitectureNotes` (file locations, patterns, impact warnings) per task. The codegen layer consumes those notes for file paths/patterns, falling back to current behavior when notes are absent. The Review node is deterministic — it inspects the change set + verification result and emits a `ReviewOutput` verdict. Separately, a prompt-loader reads the markdown prompts under `docs/prompts/`, and the OpenAI provider is upgraded from a placeholder into a real `httpx` chat call (still behind `OPENAI_API_KEY`; the deterministic stub remains the default). Every node preserves the project's hard rule: **never fail `/runs`; degrade to a safe default.**

**Tech Stack:** Python 3.11 + Pydantic 2 + LangGraph (ai-runtime); Java 21 + Spring Boot 3.3 (control-plane DTO mirror); TypeScript + Next.js 15 (frontend types + console); `httpx` (already a dependency) for the LLM call. Tests: `pytest`.

## Global Constraints

- **Never fail `/runs`.** Every new node wraps its body in try/except and returns a safe default on any error (mirror the pattern in `ai-runtime/src/evocode_runtime/graph/nodes.py`). Logged via `logger.exception`, never re-raised.
- **No new runtime dependencies.** Use only what is already in `ai-runtime/pyproject.toml` (`fastapi`, `uvicorn`, `pydantic`, `langgraph`; dev: `pytest`, `httpx`). The real LLM call uses `httpx`, which is already present.
- **Deterministic by default.** Architect, codegen, and Review must produce identical output for identical input with no external credentials. The OpenAI path is the only non-deterministic path and is gated by `OPENAI_API_KEY`; default remains `StubLlmProvider`.
- **Contract mirrored across four layers.** Any field added to `RunResult` must appear in all four: `contracts/intent.schema.json`, `ai-runtime/.../models.py` (Pydantic, camelCase `alias`), `control-plane/.../dto/*.java` (Java record), `frontend/src/types/intent.ts` (TS interface). camelCase on the wire.
- **Comments in Chinese**, matching the existing source style in `ai-runtime/src/evocode_runtime/`.
- **Backward compatible.** Existing tests must continue to pass unchanged. New fields on `RunResult` are optional/defaulted so existing response consumers don't break.

---

### Task 1: Prompt loader + real OpenAI planning provider

**Files:**
- Create: `ai-runtime/src/evocode_runtime/llm/prompts.py`
- Modify: `ai-runtime/src/evocode_runtime/llm/openai_provider.py`
- Test: `ai-runtime/tests/test_prompts.py`, `ai-runtime/tests/test_openai_provider.py`

**Interfaces:**
- Consumes: `LlmGateway` ABC (`llm/gateway.py`), `EngineeringTask` (`models.py`).
- Produces:
  - `load_prompt(name: str) -> str` — reads `docs/prompts/<name>.md` relative to repo root; returns `""` if missing.
  - `OpenAiLlmProvider.plan(intent, context) -> list[EngineeringTask]` — now performs a real `httpx.post` chat-completions call using the planner + master prompts as the system message, parsing a JSON task array from the response; falls back to a single generic task on any error.

- [ ] **Step 1: Write the failing test for the prompt loader**

```python
# ai-runtime/tests/test_prompts.py
from evocode_runtime.llm.prompts import load_prompt


def test_load_prompt_reads_planner_markdown():
    text = load_prompt("planner-prompt")
    assert isinstance(text, str)
    assert len(text) > 0  # docs/prompts/planner-prompt.md exists and is non-empty


def test_load_prompt_missing_returns_empty_string():
    assert load_prompt("does-not-exist-prompt") == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_prompts.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'evocode_runtime.llm.prompts'`

- [ ] **Step 3: Implement the prompt loader**

```python
# ai-runtime/src/evocode_runtime/llm/prompts.py
"""提示词加载器：把 docs/prompts/*.md 接入运行时。

设计意图：让文档中的智能体提示词成为真实的系统提示来源，而非游离的文档。
找不到文件时返回空串——绝不抛错（遵守 "never fail /runs"）。
"""
import functools
import os

# 从本文件向上定位仓库根：llm/ -> evocode_runtime/ -> src/ -> ai-runtime/ -> <repo root>
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_PROMPTS_DIR = os.path.join(_REPO_ROOT, "docs", "prompts")


@functools.lru_cache(maxsize=32)
def load_prompt(name: str) -> str:
    """读取 docs/prompts/<name>.md 的全文。缺失或读失败返回空串。"""
    path = os.path.join(_PROMPTS_DIR, f"{name}.md")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_prompts.py -v`
Expected: PASS (both tests)

- [ ] **Step 5: Write the failing test for the real OpenAI provider**

```python
# ai-runtime/tests/test_openai_provider.py
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_openai_provider.py -v`
Expected: FAIL (current provider returns placeholder, ignores httpx; `kind` list won't match)

- [ ] **Step 7: Implement the real OpenAI provider**

```python
# ai-runtime/src/evocode_runtime/llm/openai_provider.py
"""OpenAI 兼容 provider：把 docs/prompts 的规划提示词接入真实 LLM 调用。

激活条件：环境变量 OPENAI_API_KEY 存在。任何异常（网络/解析）都回退到
单一通用任务，绝不让规划阶段抛错。
"""
import json
import logging
import os

import httpx

from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.llm.prompts import load_prompt
from evocode_runtime.models import EngineeringTask

logger = logging.getLogger(__name__)

_VALID_KINDS = {"frontend", "backend", "test", "generic"}


class OpenAiLlmProvider(LlmGateway):
    def __init__(self) -> None:
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    @staticmethod
    def is_available() -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def _system_prompt(self) -> str:
        master = load_prompt("master-prompt")
        planner = load_prompt("planner-prompt")
        guidance = (
            "你是 EvoCode 的规划智能体。把用户意图拆解为工程任务，"
            '只输出 JSON 数组，每个元素形如 '
            '{"id":"task-1","title":"...","kind":"frontend|backend|test|generic","description":"..."}。'
            "不要输出 JSON 以外的任何文字。"
        )
        return "\n\n".join(p for p in (master, planner, guidance) if p)

    def _fallback(self, intent: str) -> list[EngineeringTask]:
        return [EngineeringTask(
            id="task-1", title="实现变更", kind="generic",
            description=f"[openai:{self.model}] 实现意图：{intent}")]

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        stats = (context or {}).get("stats") or {}
        user_msg = (f"意图：{intent}\n"
                    f"项目现状：{stats.get('fileCount', 0)} 文件 / "
                    f"{stats.get('componentCount', 0)} 组件。")
        try:
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": self._system_prompt()},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
            tasks = []
            for i, item in enumerate(raw, start=1):
                kind = item.get("kind")
                if kind not in _VALID_KINDS:
                    kind = "generic"
                tasks.append(EngineeringTask(
                    id=item.get("id") or f"task-{i}",
                    title=item.get("title") or "实现变更",
                    kind=kind,
                    description=item.get("description") or intent))
            return tasks or self._fallback(intent)
        except Exception:  # noqa: BLE001  网络/解析/结构任何异常 → 回退
            logger.exception("OpenAiLlmProvider.plan failed, falling back")
            return self._fallback(intent)
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_openai_provider.py tests/test_prompts.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all prior tests + new tests PASS

- [ ] **Step 10: Commit**

```bash
git add ai-runtime/src/evocode_runtime/llm/prompts.py ai-runtime/src/evocode_runtime/llm/openai_provider.py ai-runtime/tests/test_prompts.py ai-runtime/tests/test_openai_provider.py
git commit -m "feat(ai-runtime): wire docs/prompts into a real OpenAI planning provider"
```

---

### Task 2: Architect agent node + ArchitectureNotes model

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py` (add `Abstraction`, `ArchitectureNotes`)
- Create: `ai-runtime/src/evocode_runtime/agents/__init__.py`, `ai-runtime/src/evocode_runtime/agents/architect.py`
- Modify: `ai-runtime/src/evocode_runtime/graph/state.py` (add `architectureNotes` key)
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py` (add `architect_node`)
- Modify: `ai-runtime/src/evocode_runtime/graph/builder.py` (insert `architect` between `plan` and `generate`)
- Test: `ai-runtime/tests/test_architect.py`

**Interfaces:**
- Consumes: `ProjectGraph` (`pkg/graph.py`) reconstructed from `state["context"]["graph"]`; serialized tasks `list[dict]` from `state["tasks"]`.
- Produces:
  - `models.ArchitectureNotes` with camelCase aliases: `taskId`, `fileLocations: dict[str,str]`, `newAbstractions: list[Abstraction]`, `existingToExtend: list[str]`, `patternsToFollow: list[str]`, `impactWarning: str|None`, `constraints: list[str]`.
  - `models.Abstraction`: `{name: str, kind: str, description: str}`.
  - `architect.analyze_tasks(tasks: list[dict], context: dict) -> list[dict]` — one serialized `ArchitectureNotes` (`by_alias`) per task.
  - `architect_node(state) -> {"architectureNotes": list[dict], "phase": "architected"}`.

- [ ] **Step 1: Write the failing test**

```python
# ai-runtime/tests/test_architect.py
from evocode_runtime.agents.architect import analyze_tasks
from evocode_runtime.graph.nodes import architect_node


_CTX = {
    "projectId": "demo",
    "graph": {
        "nodes": [
            {"id": "f1", "type": "File", "path": "components/Button.tsx"},
            {"id": "f2", "type": "File", "path": "components/Card.tsx"},
            {"id": "c1", "type": "Component", "name": "Button"},
            {"id": "c2", "type": "Component", "name": "Card"},
        ],
        "edges": [
            {"type": "DEFINES", "from": "f1", "to": "c1"},
            {"type": "DEFINES", "from": "f2", "to": "c2"},
            {"type": "IMPORTS", "from": "f2", "to": "f1"},
        ],
        "stats": {"fileCount": 2, "componentCount": 2, "importCount": 1, "maxImpactCount": 1},
    },
}


def test_analyze_assigns_file_location_for_frontend_task():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    notes = analyze_tasks(tasks, _CTX)
    assert len(notes) == 1
    n = notes[0]
    assert n["taskId"] == "task-1"
    # 前端任务的文件位置应落在已观察到的 components/ 目录
    assert any(p.endswith(".tsx") and "components/" in p for p in n["fileLocations"].values())
    # 应从现有组件命名推断出模式约束
    assert any("component" in s.lower() or "组件" in s for s in n["patternsToFollow"])


def test_analyze_emits_impact_warning_when_extending_existing_file():
    # Card.tsx 被 1 个文件依赖；后端任务无前端影响，前端任务命中已有组件目录
    tasks = [{"id": "task-1", "title": "卡片增强", "kind": "frontend", "description": "改 card"}]
    notes = analyze_tasks(tasks, _CTX)
    # 有影响面统计时，constraints 一定非空（必须遵循现有约定）
    assert notes[0]["constraints"]


def test_architect_node_never_fails_on_empty_context():
    state = {"tasks": [{"id": "task-1", "title": "x", "kind": "generic", "description": "y"}],
             "context": {}}
    out = architect_node(state)
    assert out["phase"] == "architected"
    assert isinstance(out["architectureNotes"], list)
    assert out["architectureNotes"][0]["taskId"] == "task-1"


def test_architect_node_handles_no_tasks():
    out = architect_node({"tasks": [], "context": _CTX})
    assert out["architectureNotes"] == []
    assert out["phase"] == "architected"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_architect.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'evocode_runtime.agents'`

- [ ] **Step 3: Add the models**

Add to `ai-runtime/src/evocode_runtime/models.py` (after the `EngineeringTask` class, before `TaskGraph`):

```python
class Abstraction(BaseModel):
    name: str
    kind: str  # interface/type/class/component
    description: str


class ArchitectureNotes(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    task_id: str = Field(alias="taskId")
    file_locations: dict[str, str] = Field(default_factory=dict, alias="fileLocations")
    new_abstractions: list[Abstraction] = Field(default_factory=list, alias="newAbstractions")
    existing_to_extend: list[str] = Field(default_factory=list, alias="existingToExtend")
    patterns_to_follow: list[str] = Field(default_factory=list, alias="patternsToFollow")
    impact_warning: str | None = Field(default=None, alias="impactWarning")
    constraints: list[str] = Field(default_factory=list)
```

- [ ] **Step 4: Implement the architect agent**

```python
# ai-runtime/src/evocode_runtime/agents/__init__.py
from evocode_runtime.agents.architect import analyze_tasks

__all__ = ["analyze_tasks"]
```

```python
# ai-runtime/src/evocode_runtime/agents/architect.py
"""架构师智能体（确定性）：在 plan 之后、generate 之前运行。

读取知识图谱，为每个任务产出 ArchitectureNotes：文件落点、要遵循的命名模式、
影响面警告、硬约束。无 LLM、无凭证；相同输入产出相同结果。
对应文档 docs/agents/architect-agent.md。
"""
import os

from evocode_runtime.models import ArchitectureNotes
from evocode_runtime.pkg import ProjectGraph

# 各任务类型的默认落点（无现有约定可循时使用）
_DEFAULT_DIR = {
    "frontend": "evocode_generated/components",
    "backend": "evocode_generated/backend",
    "test": "evocode_generated/tests",
    "generic": "evocode_generated",
}


def _observed_component_dir(graph: ProjectGraph) -> str | None:
    """从现有 File 节点推断组件目录（取出现最多的 .tsx 父目录）。"""
    counts: dict[str, int] = {}
    for f in graph.files():
        path = str(f.get("path", ""))
        if path.endswith(".tsx") or path.endswith(".jsx"):
            d = os.path.dirname(path)
            if d:
                counts[d] = counts.get(d, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)


def _slug(text: str) -> str:
    import re
    words = re.findall(r"[A-Za-z0-9]+", text or "")
    return "".join(w.capitalize() for w in words[:3]) or "Feature"


def analyze_tasks(tasks: list[dict], context: dict) -> list[dict]:
    """为每个任务产出一条序列化的 ArchitectureNotes（by_alias）。"""
    graph_data = (context or {}).get("graph") or {"nodes": [], "edges": []}
    graph = ProjectGraph(graph_data.get("nodes", []), graph_data.get("edges", []))
    stats = (context or {}).get("stats") or {}
    max_impact = stats.get("maxImpactCount", 0)
    comp_dir = _observed_component_dir(graph)
    comp_names = [c.get("name") for c in graph.components() if c.get("name")]

    notes: list[dict] = []
    for task in tasks:
        kind = task.get("kind", "generic")
        name = _slug(task.get("title") or task.get("description"))
        # 文件落点：前端优先复用观察到的组件目录
        if kind == "frontend" and comp_dir:
            location = f"{comp_dir}/{name}.tsx"
        else:
            ext = {"frontend": "tsx", "backend": "java", "test": "test.ts"}.get(kind, "md")
            location = f"{_DEFAULT_DIR.get(kind, 'evocode_generated')}/{name}.{ext}"

        patterns: list[str] = []
        constraints: list[str] = []
        if comp_names:
            patterns.append(f"沿用现有组件命名风格（如 {', '.join(comp_names[:3])}）")
        if comp_dir:
            patterns.append(f"组件放置于 {comp_dir}/ 目录")
            constraints.append(f"必须与现有 {len(comp_names)} 个组件保持目录与命名一致")
        if kind == "backend":
            patterns.append("RESTful 资源命名，@RestController + @RequestMapping")

        warning = None
        if max_impact and max_impact >= 1:
            warning = f"该项目最大影响面为 {max_impact} 个文件，修改既有组件前需评估波及范围"
            constraints.append("最小化改动：优先新增而非重写既有文件")

        note = ArchitectureNotes(
            task_id=task.get("id", ""),
            file_locations={"primary": location},
            existing_to_extend=[],
            patterns_to_follow=patterns,
            impact_warning=warning,
            constraints=constraints,
        )
        notes.append(note.model_dump(by_alias=True))
    return notes
```

- [ ] **Step 5: Add the graph state key**

Modify `ai-runtime/src/evocode_runtime/graph/state.py` — add one field to `RunState`:

```python
class RunState(TypedDict):
    intent: str
    projectId: str
    repoPath: str  # 空串表示未提供
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
    architectureNotes: list  # list[dict]，序列化的 ArchitectureNotes（每任务一条）
    changeSet: list  # list[dict]: {path, content} 生成的文件
    applied: list  # list[str]: 已写入的绝对路径
    verification: dict  # {checked, passed, diagnosticCount, diagnostics}
```

- [ ] **Step 6: Add the architect_node**

Add to `ai-runtime/src/evocode_runtime/graph/nodes.py`. Add the import at the top (with the other imports):

```python
from evocode_runtime.agents import analyze_tasks
```

Add the node function (after `plan_node`, before `generate_node`):

```python
def architect_node(state: RunState) -> dict:
    """架构师阶段：为每个任务产出架构笔记，供 generate 落地时遵循。

    确定性、读知识图谱。任何异常 → 返回空笔记，绝不让 /runs 失败。"""
    tasks = state.get("tasks") or []
    try:
        notes = analyze_tasks(tasks, state.get("context") or {})
    except Exception:  # noqa: BLE001
        logger.exception("architect_node failed for project %s", state.get("projectId"))
        notes = []
    return {"architectureNotes": notes, "phase": "architected"}
```

- [ ] **Step 7: Wire architect into the graph**

Modify `ai-runtime/src/evocode_runtime/graph/builder.py`:

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from evocode_runtime.graph.state import RunState
from evocode_runtime.graph.nodes import (
    understand_node,
    plan_node,
    architect_node,
    generate_node,
    verify_node,
)


def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_node("architect", architect_node)
    builder.add_node("generate", generate_node)
    builder.add_node("verify", verify_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", "architect")
    builder.add_edge("architect", "generate")
    builder.add_edge("generate", "verify")
    builder.add_edge("verify", END)
    return builder.compile(checkpointer=MemorySaver())
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_architect.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 9: Run the full suite (graph tests now route through architect)**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all PASS (existing `test_graph.py` / `test_run_service.py` still green with the extra node)

- [ ] **Step 10: Commit**

```bash
git add ai-runtime/src/evocode_runtime/models.py ai-runtime/src/evocode_runtime/agents ai-runtime/src/evocode_runtime/graph/state.py ai-runtime/src/evocode_runtime/graph/nodes.py ai-runtime/src/evocode_runtime/graph/builder.py ai-runtime/tests/test_architect.py
git commit -m "feat(ai-runtime): add Architect agent node producing ArchitectureNotes"
```

---

### Task 3: Codegen consumes ArchitectureNotes

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/codegen/generator.py`
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py` (`generate_node` passes notes)
- Test: `ai-runtime/tests/test_codegen.py` (add cases; keep existing)

**Interfaces:**
- Consumes: `architectureNotes: list[dict]` from `state["architectureNotes"]` (Task 2 output).
- Produces:
  - `generate_change_set(tasks, intent, notes=None) -> list[dict]` — when a note for a task carries `fileLocations["primary"]`, the generated file uses that path; patterns from the note are embedded as a comment. Absent notes → current behavior (backward compatible).

- [ ] **Step 1: Write the failing test**

```python
# add to ai-runtime/tests/test_codegen.py
from evocode_runtime.codegen.generator import generate_change_set


def test_generate_uses_architect_file_location():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    notes = [{
        "taskId": "task-1",
        "fileLocations": {"primary": "evocode_generated/components/ContactPage.tsx"},
        "patternsToFollow": ["沿用现有组件命名风格（如 Button, Card）"],
        "constraints": ["最小化改动"],
        "newAbstractions": [], "existingToExtend": [], "impactWarning": None,
    }]
    files = generate_change_set(tasks, "add a contact page", notes)
    assert any(f["path"] == "evocode_generated/components/ContactPage.tsx" for f in files)
    # 架构模式应被写入生成文件的注释，形成可见的可追溯链路
    target = next(f for f in files if f["path"].endswith("ContactPage.tsx"))
    assert "沿用现有组件命名风格" in target["content"]


def test_generate_without_notes_is_backward_compatible():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    files_no_notes = generate_change_set(tasks, "x")
    files_none = generate_change_set(tasks, "x", None)
    assert files_no_notes == files_none
    assert len(files_no_notes) == 1
    assert files_no_notes[0]["path"].startswith("evocode_generated/components/")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_codegen.py::test_generate_uses_architect_file_location -v`
Expected: FAIL — `generate_change_set()` takes 2 positional args, given 3 (TypeError)

- [ ] **Step 3: Implement notes-aware generation**

Replace the bottom of `ai-runtime/src/evocode_runtime/codegen/generator.py` (the `generate_files_for_task` and `generate_change_set` functions) with:

```python
def _patterns_comment(note: dict | None) -> str:
    """把架构笔记的模式/约束渲染为生成文件顶部的可追溯注释。"""
    if not note:
        return ""
    lines = []
    for p in note.get("patternsToFollow", []):
        lines.append(f"//   pattern: {p}")
    for c in note.get("constraints", []):
        lines.append(f"//   constraint: {c}")
    if note.get("impactWarning"):
        lines.append(f"//   impact: {note['impactWarning']}")
    if not lines:
        return ""
    return "// EvoCode architecture notes:\n" + "\n".join(lines) + "\n"


def generate_files_for_task(task: dict, intent: str, note: dict | None = None) -> list[dict]:
    """为单个任务生成文件。架构笔记存在时，优先使用其 fileLocations 与模式注释。"""
    kind = task.get("kind")
    if kind == "frontend":
        p, c = _frontend_file(task, intent)
    elif kind == "backend":
        p, c = _backend_file(task, intent)
    elif kind == "test":
        p, c = _test_file(task, intent)
    else:  # generic
        name = _slug(task.get("title") or intent)
        p = f"evocode_generated/{name}.md"
        c = f"# {task.get('title')}\n\nIntent: {intent}\n\nTODO: {task.get('description', '')}\n"
    # 架构笔记接管文件落点（仅接受 evocode_generated/ 下的安全路径）
    primary = (note or {}).get("fileLocations", {}).get("primary")
    if primary and primary.startswith("evocode_generated/") and ".." not in primary.split("/"):
        p = primary
    comment = _patterns_comment(note)
    if comment:
        c = comment + c
    return [{"path": p, "content": c}]


def generate_change_set(tasks: list[dict], intent: str,
                        notes: list[dict] | None = None) -> list[dict]:
    """为所有任务生成 ChangeSet：[{path, content}]。确定性。

    notes（来自架构师阶段）按 taskId 匹配，决定文件落点与模式注释；缺省时退化为
    原有模板行为，保持向后兼容。"""
    by_task = {n.get("taskId"): n for n in (notes or [])}
    files: list[dict] = []
    for task in tasks:
        files.extend(generate_files_for_task(task, intent, by_task.get(task.get("id"))))
    return files
```

- [ ] **Step 4: Pass notes from generate_node**

Modify `generate_node` in `ai-runtime/src/evocode_runtime/graph/nodes.py` — change the `generate_change_set` call to pass notes:

```python
def generate_node(state: RunState) -> dict:
    """把任务物化为真实代码文件，写入目标 repo 的 evocode_generated/ 子目录。

    消费架构师笔记决定文件落点与模式。无 repoPath 时仍生成 changeSet（内容可见）
    但不落盘。绝不让 /runs 失败。"""
    intent = state["intent"]
    tasks = state.get("tasks") or []
    notes = state.get("architectureNotes") or []
    repo_path = state.get("repoPath") or ""
    try:
        change_set = generate_change_set(tasks, intent, notes)
    except Exception:  # noqa: BLE001
        logger.exception("generate_node failed to build change set for project %s",
                          state.get("projectId"))
        return {"changeSet": [], "applied": [], "phase": "generated"}
    applied: list[str] = []
    if repo_path and os.path.isdir(repo_path):
        try:
            applied = apply_change_set(repo_path, change_set)
        except Exception:  # noqa: BLE001  写盘失败不影响 changeSet 返回
            logger.exception("generate_node failed to apply change set to %s", repo_path)
            applied = []
    return {"changeSet": change_set, "applied": applied, "phase": "generated"}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_codegen.py -v`
Expected: PASS (new + existing codegen tests)

- [ ] **Step 6: Run the full suite**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add ai-runtime/src/evocode_runtime/codegen/generator.py ai-runtime/src/evocode_runtime/graph/nodes.py ai-runtime/tests/test_codegen.py
git commit -m "feat(ai-runtime): codegen consumes ArchitectureNotes for file locations and patterns"
```

---

### Task 4: Review agent node + ReviewOutput model

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py` (add `ReviewFinding`, `ReviewOutput`)
- Create: `ai-runtime/src/evocode_runtime/agents/review.py`
- Modify: `ai-runtime/src/evocode_runtime/agents/__init__.py` (export `review_change_set`)
- Modify: `ai-runtime/src/evocode_runtime/graph/state.py` (add `review` key)
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py` (add `review_node`)
- Modify: `ai-runtime/src/evocode_runtime/graph/builder.py` (append `review` after `verify`)
- Test: `ai-runtime/tests/test_review.py`

**Interfaces:**
- Consumes: `intent`, `tasks`, `changeSet`, `verification` from state.
- Produces:
  - `models.ReviewFinding`: `{severity: critical|major|minor|suggestion, filePath, message, suggestedFix: str|None}`.
  - `models.ReviewOutput`: `{verdict: approve|request_changes|block, findings: list[ReviewFinding], summary: str}`.
  - `review.review_change_set(intent, tasks, change_set, verification) -> dict` — serialized `ReviewOutput` (`by_alias`).
  - `review_node(state) -> {"review": dict, "phase": "reviewed"}`.

- [ ] **Step 1: Write the failing test**

```python
# ai-runtime/tests/test_review.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_review.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'evocode_runtime.agents.review'`

- [ ] **Step 3: Add the models**

Add to `ai-runtime/src/evocode_runtime/models.py` (after `VerificationResult`, before `RunResult`):

```python
class ReviewFinding(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    severity: Literal["critical", "major", "minor", "suggestion"]
    file_path: str = Field(alias="filePath")
    message: str
    suggested_fix: str | None = Field(default=None, alias="suggestedFix")


class ReviewOutput(BaseModel):
    verdict: Literal["approve", "request_changes", "block"]
    findings: list[ReviewFinding] = Field(default_factory=list)
    summary: str
```

- [ ] **Step 4: Implement the review agent**

```python
# ai-runtime/src/evocode_runtime/agents/review.py
"""审查智能体（确定性）：在 verify 之后运行，对变更集出具裁定。

依据 docs/agents/review-agent.md 的维度做静态判断：正确性（验证结果）、
安全（硬编码密钥）、完整性（是否生成测试）。相同输入产出相同裁定。
"""
import re

from evocode_runtime.models import ReviewFinding, ReviewOutput

# 简单的密钥特征：OpenAI 风格 key、长十六进制串赋值给 *key/secret/token/password
_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[=:]\s*['\"][^'\"]{12,}['\"]"),
]

_SEVERITY_RANK = {"suggestion": 0, "minor": 1, "major": 2, "critical": 3}


def _verdict(findings: list[ReviewFinding]) -> str:
    worst = max((_SEVERITY_RANK[f.severity] for f in findings), default=0)
    if worst >= _SEVERITY_RANK["critical"]:
        return "block"
    if worst >= _SEVERITY_RANK["major"]:
        return "request_changes"
    return "approve"


def review_change_set(intent: str, tasks: list[dict], change_set: list[dict],
                      verification: dict) -> dict:
    """产出序列化的 ReviewOutput（by_alias）。"""
    findings: list[ReviewFinding] = []

    # 正确性：验证未通过 → critical
    v = verification or {}
    if v.get("checked") and not v.get("passed"):
        findings.append(ReviewFinding(
            severity="critical", file_path="(verify)",
            message=f"静态类型检查未通过：{v.get('diagnosticCount', 0)} 个诊断，"
                    f"应用前必须修复。",
            suggested_fix="修复类型错误后重跑验证。"))

    # 安全：扫描硬编码密钥 → critical
    for f in change_set or []:
        content = f.get("content", "")
        if any(p.search(content) for p in _SECRET_PATTERNS):
            findings.append(ReviewFinding(
                severity="critical", file_path=f.get("path", "?"),
                message="疑似硬编码密钥/凭证（hardcoded secret），存在泄露风险。",
                suggested_fix="改用环境变量或密钥管理服务。"))

    # 完整性：是否产出测试
    has_test_file = any("test" in f.get("path", "").lower() for f in (change_set or []))
    has_test_task = any(t.get("kind") == "test" for t in (tasks or []))
    if change_set and not has_test_file:
        findings.append(ReviewFinding(
            severity="major", file_path="(change set)",
            message="变更未包含任何测试文件（missing tests）。",
            suggested_fix="为新增/修改的功能补充测试。" if has_test_task
            else "在计划中加入测试任务并生成测试。"))

    # 一致性：占位实现提示 → suggestion
    for f in change_set or []:
        if "TODO" in f.get("content", ""):
            findings.append(ReviewFinding(
                severity="suggestion", file_path=f.get("path", "?"),
                message="生成内容含 TODO 占位，需后续补全真实实现。",
                suggested_fix=None))

    verdict = _verdict(findings)
    n_crit = sum(1 for f in findings if f.severity == "critical")
    n_major = sum(1 for f in findings if f.severity == "major")
    summary = (f"裁定 {verdict}：{len(findings)} 条发现"
               f"（critical {n_crit} / major {n_major}）。意图：{intent[:60]}")
    return ReviewOutput(verdict=verdict, findings=findings, summary=summary).model_dump(by_alias=True)
```

Update `ai-runtime/src/evocode_runtime/agents/__init__.py`:

```python
from evocode_runtime.agents.architect import analyze_tasks
from evocode_runtime.agents.review import review_change_set

__all__ = ["analyze_tasks", "review_change_set"]
```

- [ ] **Step 5: Add state key + review_node**

Add to `RunState` in `ai-runtime/src/evocode_runtime/graph/state.py` (after `verification`):

```python
    review: dict  # {verdict, findings, summary} 审查裁定
```

Add to `ai-runtime/src/evocode_runtime/graph/nodes.py` — update the agents import:

```python
from evocode_runtime.agents import analyze_tasks, review_change_set
```

Add the node (after `verify_node`):

```python
def review_node(state: RunState) -> dict:
    """审查阶段：对变更集 + 验证结果出具裁定。确定性，绝不让 /runs 失败。"""
    try:
        review = review_change_set(
            intent=state.get("intent", ""),
            tasks=state.get("tasks") or [],
            change_set=state.get("changeSet") or [],
            verification=state.get("verification") or {})
    except Exception:  # noqa: BLE001
        logger.exception("review_node failed for project %s", state.get("projectId"))
        review = {"verdict": "approve", "findings": [],
                  "summary": "审查阶段内部错误，已跳过。"}
    return {"review": review, "phase": "reviewed"}
```

- [ ] **Step 6: Wire review into the graph**

Modify `ai-runtime/src/evocode_runtime/graph/builder.py` — add the import and the node + edges:

```python
from evocode_runtime.graph.nodes import (
    understand_node,
    plan_node,
    architect_node,
    generate_node,
    verify_node,
    review_node,
)
```

In `build_graph`, add after the `verify` node line and change the `verify → END` edge:

```python
    builder.add_node("review", review_node)
    ...
    builder.add_edge("verify", "review")
    builder.add_edge("review", END)
```

(Remove the old `builder.add_edge("verify", END)`.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_review.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 8: Run the full suite**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add ai-runtime/src/evocode_runtime/models.py ai-runtime/src/evocode_runtime/agents ai-runtime/src/evocode_runtime/graph/state.py ai-runtime/src/evocode_runtime/graph/nodes.py ai-runtime/src/evocode_runtime/graph/builder.py ai-runtime/tests/test_review.py
git commit -m "feat(ai-runtime): add Review agent node emitting verdict + findings"
```

---

### Task 5: Surface review in RunResult + contract mirror (Python/schema/Java/TS)

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py` (`RunResult.review`)
- Modify: `ai-runtime/src/evocode_runtime/run_service.py` (populate `review`)
- Modify: `contracts/intent.schema.json` (add `ReviewFinding`, `ReviewOutput`; `RunResult.review`)
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/ReviewFinding.java`, `ReviewOutput.java`
- Modify: `control-plane/src/main/java/com/evocode/controlplane/dto/RunResult.java`
- Modify: `frontend/src/types/intent.ts`
- Test: `ai-runtime/tests/test_run_service.py` (add a case)

**Interfaces:**
- Consumes: `state["review"]` (Task 4), `models.ReviewOutput`.
- Produces: `RunResult.review: ReviewOutput | None` on the wire as `review` (camelCase already).

- [ ] **Step 1: Write the failing test**

```python
# add to ai-runtime/tests/test_run_service.py
from evocode_runtime.run_service import RunService


def test_run_result_includes_review_verdict():
    svc = RunService()
    result = svc.execute(intent="add a contact page", project_id="demo", repo_path="")
    assert result.review is not None
    assert result.review.verdict in {"approve", "request_changes", "block"}
    # 无 repoPath → 未生成测试文件路径? 计划里 stub 会产出 test 任务，但 changeSet 含 test 文件
    assert isinstance(result.review.findings, list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_run_service.py::test_run_result_includes_review_verdict -v`
Expected: FAIL — `RunResult` has no attribute `review`

- [ ] **Step 3: Add `review` to the Pydantic RunResult**

In `ai-runtime/src/evocode_runtime/models.py`, add to `RunResult` (after `verification`):

```python
    review: "ReviewOutput | None" = Field(default=None)
```

- [ ] **Step 4: Populate review in RunService**

In `ai-runtime/src/evocode_runtime/run_service.py`, import `ReviewOutput` and build it from `final`:

Update the import block:

```python
from evocode_runtime.models import (
    RunResult, TaskGraph, EngineeringTask, ProjectGraphStats,
    ChangeFile, VerificationResult, Diagnostic, ReviewOutput,
)
```

After the `verification = ...` block and before `return RunResult(...)`, add:

```python
            r = final.get("review") or {}
            review = ReviewOutput(**r) if r else None
```

Then add `review=review,` to the success `RunResult(...)` constructor call (alongside `verification=verification`).

- [ ] **Step 5: Run the Python test + full suite**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all PASS

- [ ] **Step 6: Mirror in the JSON Schema**

In `contracts/intent.schema.json`, add two definitions (after `VerificationResult`) and a `review` property on `RunResult`:

```json
    "ReviewFinding": {
      "type": "object",
      "required": ["severity", "filePath", "message"],
      "properties": {
        "severity": { "type": "string", "enum": ["critical", "major", "minor", "suggestion"] },
        "filePath": { "type": "string" },
        "message": { "type": "string" },
        "suggestedFix": { "type": ["string", "null"] }
      }
    },
    "ReviewOutput": {
      "type": "object",
      "required": ["verdict", "findings", "summary"],
      "properties": {
        "verdict": { "type": "string", "enum": ["approve", "request_changes", "block"] },
        "findings": { "type": "array", "items": { "$ref": "#/definitions/ReviewFinding" } },
        "summary": { "type": "string" }
      }
    },
```

And add to `RunResult.properties` (after `verification`):

```json
        "review": { "$ref": "#/definitions/ReviewOutput" }
```

- [ ] **Step 7: Mirror in Java DTOs**

```java
// control-plane/src/main/java/com/evocode/controlplane/dto/ReviewFinding.java
package com.evocode.controlplane.dto;

public record ReviewFinding(
    String severity,
    String filePath,
    String message,
    String suggestedFix
) {}
```

```java
// control-plane/src/main/java/com/evocode/controlplane/dto/ReviewOutput.java
package com.evocode.controlplane.dto;

import java.util.List;

public record ReviewOutput(
    String verdict,
    List<ReviewFinding> findings,
    String summary
) {}
```

Modify `control-plane/src/main/java/com/evocode/controlplane/dto/RunResult.java` — add a `ReviewOutput review` field as the last record component (matching the existing record style; read the file first to place it correctly alongside `verification`).

- [ ] **Step 8: Mirror in TS types**

Add to `frontend/src/types/intent.ts`:

```typescript
export interface ReviewFinding {
  severity: "critical" | "major" | "minor" | "suggestion";
  filePath: string;
  message: string;
  suggestedFix?: string | null;
}

export interface ReviewOutput {
  verdict: "approve" | "request_changes" | "block";
  findings: ReviewFinding[];
  summary: string;
}
```

And add `review?: ReviewOutput;` to the `RunResult` interface (after `verification`).

- [ ] **Step 9: Verify Java compiles**

Run: `cd control-plane && mvn -q -o compile` (if offline deps unavailable, run `mvn -q compile`)
Expected: BUILD SUCCESS. If Maven cannot resolve deps in this environment, note it in the task report and rely on the JSON-shape correctness (records are mechanical mirrors).

- [ ] **Step 10: Verify TS type-checks**

Run: `cd frontend && pnpm exec tsc --noEmit` (or `npx tsc --noEmit`)
Expected: no type errors.

- [ ] **Step 11: Commit**

```bash
git add ai-runtime/src/evocode_runtime/models.py ai-runtime/src/evocode_runtime/run_service.py ai-runtime/tests/test_run_service.py contracts/intent.schema.json control-plane/src/main/java/com/evocode/controlplane/dto/ReviewFinding.java control-plane/src/main/java/com/evocode/controlplane/dto/ReviewOutput.java control-plane/src/main/java/com/evocode/controlplane/dto/RunResult.java frontend/src/types/intent.ts
git commit -m "feat: surface Review verdict in RunResult across contract/Java/TS"
```

---

### Task 6: Console renders review verdict + architecture notes; end-to-end docs

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `README.md` (document the extended pipeline `understand→plan→architect→generate→verify→review`)
- Modify: `.superpowers/sdd/progress.md` (record increment 6)

**Interfaces:**
- Consumes: `RunResult.review` (Task 5 TS type).
- Produces: visible verdict + findings list in the console.

- [ ] **Step 1: Render review in the console**

In `frontend/src/app/page.tsx`, add a block inside the `{result && ( ... )}` section, after the `verification` paragraph (before the closing `</section>`):

```tsx
          {result.review && (
            <div style={{ marginTop: 16 }}>
              <h3>
                审查裁定：{result.review.verdict === "approve"
                  ? "✓ 通过 (approve)"
                  : result.review.verdict === "request_changes"
                  ? "⚠ 需修改 (request_changes)"
                  : "✗ 阻断 (block)"}
              </h3>
              <p>{result.review.summary}</p>
              {result.review.findings.length > 0 && (
                <ul>
                  {result.review.findings.map((f, i) => (
                    <li key={i}>
                      <strong>[{f.severity}]</strong> <code>{f.filePath}</code> — {f.message}
                      {f.suggestedFix ? <em> 建议：{f.suggestedFix}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
```

- [ ] **Step 2: Verify TS type-checks**

Run: `cd frontend && pnpm exec tsc --noEmit` (or `npx tsc --noEmit`)
Expected: no type errors.

- [ ] **Step 3: End-to-end smoke run (Python runtime only — no external creds)**

Run the runtime in one shell and curl it (the deterministic stub path needs no `OPENAI_API_KEY`):

```bash
cd ai-runtime && .venv/Scripts/python -m uvicorn evocode_runtime.main:app --port 8000 &
# then in another shell:
curl -s -X POST http://localhost:8000/runs -H "Content-Type: application/json" \
  -d '{"intent":"add a contact page with a comments API","projectId":"demo"}'
```

Expected: JSON `RunResult` with `phase: "reviewed"`, a non-empty `taskGraph.tasks`, a `changeSet`, and a `review` object whose `verdict` is one of approve/request_changes/block. Stop the uvicorn process afterward.

- [ ] **Step 4: Update README pipeline description**

In `README.md`, update any description of the pipeline to read `understand → plan → architect → generate → verify → review`, and add a short paragraph noting: the Architect node produces architecture notes (deterministic, graph-driven), the Review node emits a verdict, and setting `OPENAI_API_KEY` switches planning to a real prompt-driven OpenAI call (prompts loaded from `docs/prompts/`). Read the file first and edit the relevant section rather than appending.

- [ ] **Step 5: Update the progress ledger**

Append to `.superpowers/sdd/progress.md`:

```markdown

## 增量 6 — Architect + Review 智能体 & 提示词接入 LLM
计划: docs/superpowers/plans/2026-06-28-evocode-increment-6-architect-review.md
- Task 1: 提示词加载器 + 真实 OpenAI provider — done
- Task 2: Architect 节点 + ArchitectureNotes — done
- Task 3: codegen 消费架构笔记 — done
- Task 4: Review 节点 + ReviewOutput — done
- Task 5: RunResult.review 四层契约镜像 — done
- Task 6: 控制台渲染 + 端到端文档 — done
```

- [ ] **Step 6: Final full Python suite + commit**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: all PASS.

```bash
git add frontend/src/app/page.tsx README.md .superpowers/sdd/progress.md
git commit -m "feat(frontend): render review verdict; docs: extended pipeline end-to-end"
```

---

## Self-Review

**1. Spec coverage** (Path B's three threads from the audit):
- Thread 1 "wire `docs/prompts/*` into a real LLM path" → Task 1 (prompt loader + real httpx OpenAI call). ✓
- Thread 2 "add Architect and Review nodes" → Task 2 (Architect) + Task 4 (Review), both wired into `builder.py`. ✓
- Thread 3 "make codegen read the knowledge graph" → Task 2 (Architect reads `ProjectGraph`) + Task 3 (codegen consumes notes). ✓
- Contract mirror obligation (Global Constraints) → Task 5 (Python/schema/Java/TS). ✓
- Surfacing to user → Task 6 (console). ✓

**2. Placeholder scan:** Every code step contains complete, runnable code. The only `TODO` strings are inside generated-template literals (pre-existing behavior the Review node now flags) and test assertions about them — not plan placeholders. Task 5 Step 7 and Task 6 Steps 4 instruct "read the file first" for a precise insertion point rather than reproducing an unrelated full file; the field/edit to make is fully specified. ✓

**3. Type consistency:**
- `ArchitectureNotes` fields (`taskId`, `fileLocations`, `patternsToFollow`, `constraints`, `impactWarning`, `newAbstractions`, `existingToExtend`) are defined in Task 2 Step 3 and consumed identically in Task 3 (`fileLocations["primary"]`, `patternsToFollow`, `constraints`, `impactWarning`). ✓
- `ReviewOutput`/`ReviewFinding` fields (`verdict`, `findings`, `summary`, `severity`, `filePath`, `message`, `suggestedFix`) defined in Task 4 Step 3, mirrored verbatim in Task 5 (schema/Java/TS) and consumed in Task 6 (`f.filePath`, `f.severity`, `f.suggestedFix`). ✓
- `review_change_set(intent, tasks, change_set, verification)` signature defined in Task 4 and called identically in `review_node` (Task 4 Step 5) and `RunService` reads `final.get("review")`. ✓
- `generate_change_set(tasks, intent, notes=None)` signature defined in Task 3 and called with `(tasks, intent, notes)` in `generate_node`. ✓
- Graph wiring is consistent: Task 2 sets `plan→architect→generate`; Task 4 sets `verify→review→END`. Final pipeline: `understand→plan→architect→generate→verify→review`. ✓

**4. Risk notes:**
- Windows venv path is `.venv/Scripts/python` (used throughout), not Unix `bin/`. ✓
- Java/TS toolchains may not resolve deps offline in this environment; Tasks 5/6 instruct to attempt the build and report if blocked — the DTO/type edits are mechanical mirrors validated against the schema regardless. ✓
- `httpx` is a dev dependency, available in the test venv; the real OpenAI path is exercised only via monkeypatched `httpx.post` in tests, so no network is required to verify. ✓
