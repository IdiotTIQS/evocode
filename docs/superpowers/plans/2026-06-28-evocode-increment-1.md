# EvoCode 增量 1 — LangGraph Planner 流水线 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** 让 POST /runs 执行真实 LangGraph StateGraph（understand→plan），返回 Planner 产出的真实 TaskGraph，而非桩化确认。

**Architecture:** 四层 FINAL 不变；只深化 Python AI 运行时层。可插拔 LlmGateway（默认确定性 stub，OpenAI 兼容可选）；LangGraph 内存检查点。契约 RunAcknowledgement→RunResult（含 taskGraph）。

**Tech Stack:** langgraph 1.2.6（langchain-core 1.4.8）/ FastAPI / Pydantic 2 / Spring Boot 3.3.7 / Next.js 15.5.19。

## Global Constraints

- 四层架构 FINAL；依赖单向向下；跨层 REST/JSON 驼峰。
- LangGraph 1.2.6 准确 API（见 .superpowers/sdd/langgraph-api-notes.md）：`from langgraph.graph import StateGraph, START, END`；`from langgraph.checkpoint.memory import MemorySaver`；入口用 `add_edge(START, ...)`（无 set_entry_point）；编译 `builder.compile(checkpointer=MemorySaver())`；invoke 必须带 `config={"configurable":{"thread_id": runId}}`；node 返回 partial dict 自动 last-write-wins 合并；list 字段无 reducer 时需在 node 内手动 `state.get("tasks") or [] + [...]`。
- 零外部依赖可测：StubLlmProvider 确定性，无需 API key。
- 契约三处镜像同步：contracts schema / Pydantic / Java record / TS。
- 依赖 pin 精确版本；Python venv 在 ai-runtime/.venv（Windows: .venv/Scripts/python）。
- RunResult 字段：runId(uuid), status("completed"|"failed"), phase(str), taskGraph{tasks:EngineeringTask[]}, message(str)。
- EngineeringTask 字段：id, title, kind("frontend"|"backend"|"test"|"generic"), description。

---

### Task 1: 契约升级（contracts schema）

**Files:**
- Modify: `contracts/intent.schema.json`
- Modify: `contracts/README.md`（如需补充镜像说明）

**Interfaces:**
- Consumes: 无
- Produces: JSON Schema 新增 `EngineeringTask`、`TaskGraph`、`RunResult` 定义；保留 `IntentRequest`。后续三层据此镜像。

- [ ] **Step 1: 在 intent.schema.json 的 definitions 增加三个定义**

在现有 `definitions` 对象内（保留 IntentRequest，移除或保留 RunAcknowledgement 均可——本增量 RunResult 取代它，建议移除 RunAcknowledgement 以免歧义）加入：

```json
"EngineeringTask": {
  "type": "object",
  "required": ["id", "title", "kind", "description"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "title": { "type": "string", "minLength": 1 },
    "kind": { "type": "string", "enum": ["frontend", "backend", "test", "generic"] },
    "description": { "type": "string" }
  }
},
"TaskGraph": {
  "type": "object",
  "required": ["tasks"],
  "properties": {
    "tasks": { "type": "array", "items": { "$ref": "#/definitions/EngineeringTask" } }
  }
},
"RunResult": {
  "type": "object",
  "required": ["runId", "status", "phase", "taskGraph", "message"],
  "properties": {
    "runId": { "type": "string", "format": "uuid" },
    "status": { "type": "string", "enum": ["completed", "failed"] },
    "phase": { "type": "string" },
    "taskGraph": { "$ref": "#/definitions/TaskGraph" },
    "message": { "type": "string" }
  }
}
```

- [ ] **Step 2: 更新 contracts/README.md**

在镜像位置说明处补充：RunResult/TaskGraph/EngineeringTask 同样三处镜像。无需大改。

- [ ] **Step 3: Commit**

```bash
git add contracts/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(contracts): add EngineeringTask/TaskGraph/RunResult, replacing RunAcknowledgement"
```

---

### Task 2: Python LangGraph Planner 流水线

**Files:**
- Modify: `ai-runtime/pyproject.toml`（加 langgraph==1.2.6）
- Modify: `ai-runtime/src/evocode_runtime/models.py`（加 EngineeringTask/TaskGraph/RunResult）
- Create: `ai-runtime/src/evocode_runtime/llm/__init__.py`
- Create: `ai-runtime/src/evocode_runtime/llm/gateway.py`
- Create: `ai-runtime/src/evocode_runtime/llm/stub_provider.py`
- Create: `ai-runtime/src/evocode_runtime/llm/openai_provider.py`
- Create: `ai-runtime/src/evocode_runtime/llm/factory.py`
- Create: `ai-runtime/src/evocode_runtime/graph/__init__.py`
- Create: `ai-runtime/src/evocode_runtime/graph/state.py`
- Create: `ai-runtime/src/evocode_runtime/graph/nodes.py`
- Create: `ai-runtime/src/evocode_runtime/graph/builder.py`
- Create: `ai-runtime/src/evocode_runtime/run_service.py`
- Modify: `ai-runtime/src/evocode_runtime/main.py`（/runs 改调 RunService）
- Modify: `ai-runtime/src/evocode_runtime/services/__init__.py`（接缝注释更新）
- Test: `ai-runtime/tests/test_stub_provider.py`
- Test: `ai-runtime/tests/test_graph.py`
- Test: `ai-runtime/tests/test_run_service.py`
- Modify: `ai-runtime/tests/test_health.py`（/runs 断言升级为含 taskGraph）

**Interfaces:**
- Consumes: contracts（Task 1）；langgraph-api-notes.md 的 API。
- Produces:
  - `models.EngineeringTask(id,title,kind,description)`, `models.TaskGraph(tasks)`, `models.RunResult(runId,status,phase,taskGraph,message)` — Pydantic，driver 用 alias 保持驼峰（字段本就驼峰，无需 alias 除非 snake）。
  - `llm.gateway.LlmGateway` 抽象：`plan(intent:str, context:dict) -> list[EngineeringTask]`。
  - `llm.factory.get_llm_gateway() -> LlmGateway`（默认 StubLlmProvider）。
  - `graph.builder.build_graph() -> CompiledGraph`。
  - `run_service.RunService.execute(intent:str, project_id:str) -> RunResult`。

- [ ] **Step 1: pyproject.toml 加依赖**

在 dependencies 列表加一行：`"langgraph==1.2.6",`

- [ ] **Step 2: models.py 增加契约模型**

在现有 models.py 追加（保留 IntentRequest；移除 RunAcknowledgement，由 RunResult 取代）：

```python
from typing import Literal
from pydantic import BaseModel, Field


class EngineeringTask(BaseModel):
    id: str
    title: str
    kind: Literal["frontend", "backend", "test", "generic"]
    description: str


class TaskGraph(BaseModel):
    tasks: list[EngineeringTask] = Field(default_factory=list)


class RunResult(BaseModel):
    run_id: str = Field(alias="runId")
    status: Literal["completed", "failed"]
    phase: str
    task_graph: TaskGraph = Field(alias="taskGraph")
    message: str

    model_config = {"populate_by_name": True}
```

保留 IntentRequest 不变。删除 RunAcknowledgement 类及其 accept() 方法。

- [ ] **Step 3: 写 llm/gateway.py（抽象 + 写失败测试先行）**

先写测试 `tests/test_stub_provider.py`：

```python
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
```

- [ ] **Step 4: 运行测试，确认失败（模块不存在）**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_stub_provider.py -v`
Expected: FAIL（ModuleNotFoundError）。

- [ ] **Step 5: 写 llm/gateway.py**

```python
from abc import ABC, abstractmethod
from evocode_runtime.models import EngineeringTask


class LlmGateway(ABC):
    """LLM 网关抽象：把意图+上下文规划为工程任务列表。"""

    @abstractmethod
    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        ...
```

- [ ] **Step 6: 写 llm/stub_provider.py（确定性规则）**

```python
from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.models import EngineeringTask

_FRONTEND_KW = ("page", "页面", "ui", "component", "组件", "feed")
_BACKEND_KW = ("api", "endpoint", "接口", "service", "服务", "entity", "数据库")


class StubLlmProvider(LlmGateway):
    """确定性规则规划器，无需外部凭证。相同输入产出相同任务。"""

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        low = intent.lower()
        tasks: list[EngineeringTask] = []
        n = 0
        if any(k in low for k in _FRONTEND_KW):
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现前端界面", kind="frontend",
                description=f"为意图实现 React/Next.js 界面：{intent}"))
        if any(k in low for k in _BACKEND_KW):
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现后端 API", kind="backend",
                description=f"为意图实现 Spring Boot 端点/服务：{intent}"))
        if not tasks:
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现变更", kind="generic",
                description=f"实现意图：{intent}"))
        n += 1
        tasks.append(EngineeringTask(
            id=f"task-{n}", title="编写测试", kind="test",
            description="为上述变更编写单元/集成测试"))
        return tasks
```

- [ ] **Step 7: 运行测试，确认通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_stub_provider.py -v`
Expected: 4 passed。

- [ ] **Step 8: 写 llm/openai_provider.py（OpenAI 兼容，无 key 不激活）**

```python
import os
from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.models import EngineeringTask


class OpenAiLlmProvider(LlmGateway):
    """OpenAI 兼容 provider。从环境变量读取配置。
    本增量仅提供骨架：若被激活但未实现完整调用，回退到简单解析。
    真实 LLM 调用在后续增量完善。"""

    def __init__(self) -> None:
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    @staticmethod
    def is_available() -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        # 后续增量实现真实 OpenAI 调用。当前激活时返回单一通用任务占位。
        return [EngineeringTask(
            id="task-1", title="实现变更", kind="generic",
            description=f"[openai:{self.model}] 实现意图：{intent}")]
```

- [ ] **Step 9: 写 llm/factory.py + llm/__init__.py**

factory.py:
```python
from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.llm.stub_provider import StubLlmProvider
from evocode_runtime.llm.openai_provider import OpenAiLlmProvider


def get_llm_gateway() -> LlmGateway:
    """默认 stub；若配置了 OPENAI_API_KEY 则用 OpenAI provider。"""
    if OpenAiLlmProvider.is_available():
        return OpenAiLlmProvider()
    return StubLlmProvider()
```

llm/__init__.py:
```python
from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.llm.factory import get_llm_gateway

__all__ = ["LlmGateway", "get_llm_gateway"]
```

- [ ] **Step 10: 写 graph/state.py**

```python
from typing import TypedDict


class RunState(TypedDict):
    intent: str
    projectId: str
    context: dict
    phase: str
    tasks: list  # list[dict]，序列化的 EngineeringTask
```

- [ ] **Step 11: 写 graph/nodes.py**

```python
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway


def understand_node(state: RunState) -> dict:
    # 增量 1：占位 context（回显 projectId，空图结构）。真实 PKG 抽取后续增量。
    return {
        "context": {"projectId": state["projectId"], "graph": {"nodes": [], "edges": []}},
        "phase": "understood",
    }


def plan_node(state: RunState) -> dict:
    gateway = get_llm_gateway()
    tasks = gateway.plan(state["intent"], state.get("context") or {})
    return {
        "tasks": [t.model_dump() for t in tasks],
        "phase": "planned",
    }
```

- [ ] **Step 12: 写 graph/builder.py + graph/__init__.py**

builder.py:
```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from evocode_runtime.graph.state import RunState
from evocode_runtime.graph.nodes import understand_node, plan_node


def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", END)
    return builder.compile(checkpointer=MemorySaver())
```

graph/__init__.py:
```python
from evocode_runtime.graph.builder import build_graph

__all__ = ["build_graph"]
```

- [ ] **Step 13: 写 graph 测试 tests/test_graph.py**

```python
from evocode_runtime.graph import build_graph


def test_graph_produces_taskgraph():
    graph = build_graph()
    config = {"configurable": {"thread_id": "test-thread-1"}}
    result = graph.invoke(
        {"intent": "add a contact page", "projectId": "demo",
         "context": {}, "phase": "", "tasks": []},
        config=config)
    assert result["phase"] == "planned"
    assert len(result["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in result["tasks"])
```

- [ ] **Step 14: 运行 graph 测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_graph.py -v`
Expected: 1 passed。

- [ ] **Step 15: 写 run_service.py**

```python
from uuid import uuid4
from evocode_runtime.graph import build_graph
from evocode_runtime.models import RunResult, TaskGraph, EngineeringTask

_graph = build_graph()


class RunService:
    """编排 LangGraph 执行，产出 RunResult。"""

    def execute(self, intent: str, project_id: str) -> RunResult:
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            final = _graph.invoke(
                {"intent": intent, "projectId": project_id,
                 "context": {}, "phase": "", "tasks": []},
                config=config)
            tasks = [EngineeringTask(**t) for t in final.get("tasks", [])]
            return RunResult(
                runId=run_id, status="completed", phase=final.get("phase", "planned"),
                taskGraph=TaskGraph(tasks=tasks),
                message=f"Planned {len(tasks)} task(s) for project {project_id}")
        except Exception as exc:  # noqa: BLE001
            return RunResult(
                runId=run_id, status="failed", phase="failed",
                taskGraph=TaskGraph(tasks=[]),
                message=f"Run failed: {exc}")
```

- [ ] **Step 16: 写 run_service 测试 tests/test_run_service.py**

```python
from evocode_runtime.run_service import RunService


def test_execute_returns_completed_runresult():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.phase == "planned"
    assert len(result.task_graph.tasks) >= 1
    assert any(t.kind == "backend" for t in result.task_graph.tasks)
    assert result.run_id
```

- [ ] **Step 17: 改 main.py /runs 端点**

```python
from fastapi import FastAPI
from evocode_runtime.models import IntentRequest, RunResult
from evocode_runtime.run_service import RunService

app = FastAPI(title="EvoCode AI Runtime", version="0.1.0")
_run_service = RunService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunResult, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunResult:
    return _run_service.execute(req.intent, req.project_id)
```

- [ ] **Step 18: 改 services/__init__.py 接缝注释**

更新docstring：Planner 流水线（LangGraph understand→plan）已实现；PKG 真实抽取、Frontend/Backend/Review/Test Agent、验证引擎仍为后续增量。

- [ ] **Step 19: 改 tests/test_health.py 的 /runs 断言**

把原 `test_create_run_returns_accepted` 升级：

```python
def test_create_run_returns_taskgraph():
    resp = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert body["runId"]
    assert "taskGraph" in body
    assert len(body["taskGraph"]["tasks"]) >= 1
    assert any(t["kind"] == "frontend" for t in body["taskGraph"]["tasks"])
```
保留 test_health_ok 不变。

- [ ] **Step 20: 安装依赖并跑全部测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pip install -e ".[dev]" && .venv/Scripts/python -m pytest -v`
Expected: 全部通过（health + stub_provider 4 + graph 1 + run_service 1 + /runs taskgraph）。

- [ ] **Step 21: Commit**

```bash
git add ai-runtime/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): LangGraph understand->plan pipeline with pluggable LLM gateway"
```

---

### Task 3: Java 控制平面 DTO 升级

**Files:**
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/EngineeringTask.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/TaskGraph.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/RunResult.java`
- Delete: `control-plane/src/main/java/com/evocode/controlplane/dto/RunAcknowledgement.java`
- Modify: `control-plane/src/main/java/com/evocode/controlplane/client/PythonRuntimeClient.java`
- Modify: `control-plane/src/main/java/com/evocode/controlplane/api/IntentController.java`

**Interfaces:**
- Consumes: Python /runs 现返回 RunResult（含 taskGraph）。
- Produces: 网关 POST /api/intents 返回 RunResult，原样透传。

- [ ] **Step 1: 写 EngineeringTask.java**

```java
package com.evocode.controlplane.dto;

public record EngineeringTask(
    String id,
    String title,
    String kind,
    String description
) {}
```

- [ ] **Step 2: 写 TaskGraph.java**

```java
package com.evocode.controlplane.dto;

import java.util.List;

public record TaskGraph(
    List<EngineeringTask> tasks
) {}
```

- [ ] **Step 3: 写 RunResult.java**

```java
package com.evocode.controlplane.dto;

public record RunResult(
    String runId,
    String status,
    String phase,
    TaskGraph taskGraph,
    String message
) {}
```

- [ ] **Step 4: 删除 RunAcknowledgement.java**

```bash
git rm control-plane/src/main/java/com/evocode/controlplane/dto/RunAcknowledgement.java
```

- [ ] **Step 5: 改 PythonRuntimeClient.java**

把返回类型从 RunAcknowledgement 改为 RunResult（import 与方法签名、`.body(RunResult.class)`）。其余（SimpleClientHttpRequestFactory、contentType）不变。

- [ ] **Step 6: 改 IntentController.java**

把方法返回类型 RunAcknowledgement → RunResult，import 同步。逻辑仍是透传 `runtimeClient.createRun(request)`。

- [ ] **Step 7: 编译 + 测试**

Run: `cd control-plane && mvn -q compile && mvn -q test`
Expected: BUILD SUCCESS，contextLoads 通过。

- [ ] **Step 8: Commit**

```bash
git add control-plane/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(control-plane): replace RunAcknowledgement with RunResult/TaskGraph DTOs"
```

---

### Task 4: 前端渲染 TaskGraph

**Files:**
- Modify: `frontend/src/types/intent.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: 网关返回 RunResult（含 taskGraph）。
- Produces: 页面渲染任务列表。

- [ ] **Step 1: 改 src/types/intent.ts**

```typescript
// 镜像 contracts/intent.schema.json
export interface IntentRequest {
  intent: string;
  projectId: string;
}

export type TaskKind = "frontend" | "backend" | "test" | "generic";

export interface EngineeringTask {
  id: string;
  title: string;
  kind: TaskKind;
  description: string;
}

export interface TaskGraph {
  tasks: EngineeringTask[];
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed";
  phase: string;
  taskGraph: TaskGraph;
  message: string;
}
```

- [ ] **Step 2: 改 src/lib/api.ts**

把 `submitIntent` 返回类型从 RunAcknowledgement 改为 RunResult（import 与泛型）。fetch 逻辑不变。

- [ ] **Step 3: 改 src/app/page.tsx**

把 result 状态类型改为 `RunResult`，渲染部分把原来的 `<pre>{JSON.stringify(result)}</pre>` 替换为任务列表渲染：

```tsx
{result && (
  <section style={{ marginTop: 24 }}>
    <p>Run <code>{result.runId}</code> — {result.status} ({result.phase})</p>
    <p>{result.message}</p>
    <ul>
      {result.taskGraph.tasks.map((t) => (
        <li key={t.id}>
          <strong>[{t.kind}]</strong> {t.title} — {t.description}
        </li>
      ))}
    </ul>
  </section>
)}
```
保留表单与错误渲染不变。

- [ ] **Step 4: 构建**

Run: `cd frontend && pnpm build`
Expected: 构建成功，无类型错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(frontend): render planned TaskGraph from RunResult"
```

---

## Self-Review

**Spec coverage:** §3 契约升级→T1；§4 ai-runtime 架构(llm/graph/agents/run_service)→T2；§5 跨层 Java→T3、前端→T4；§6 测试→T2(stub/graph/run_service/health)、T3(context)、T4(build)、端到端在收尾。✓
**Placeholder scan:** 各步含完整代码/命令；OpenAiLlmProvider 占位是设计意图（注释标注后续完善），非计划占位。✓
**Type consistency:** RunResult 字段 runId/status/phase/taskGraph/message 在 schema/Pydantic(alias)/Java record/TS 四处一致；EngineeringTask id/title/kind/description 一致；kind 枚举四值一致。Pydantic 用 alias + populate_by_name + response_model_by_alias 保证驼峰。✓
**LangGraph API:** 全部按 langgraph-api-notes.md 的 1.2.6 实测 API（START/END、MemorySaver、thread_id、partial dict 合并、list 手动 extend）。✓
