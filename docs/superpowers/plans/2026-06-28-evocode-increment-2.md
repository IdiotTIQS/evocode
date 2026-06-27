# EvoCode 增量 2 — 真实 PKG TS 抽取器 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** understand 节点从占位 context 变为真实项目知识图谱——经 subprocess 调用 Node ts-morph 抽取目标 React/Next.js 仓库的 File/Component/IMPORTS 图，放进 RunState.context，Planner 据真实结构规划。

**Architecture:** 四层 FINAL 不变，新增 `tools/ts-extractor/`（Node 工具，业务服务层调用）。AI 运行时 Python 经 subprocess 调用。纯内存图，无 DB。repoPath 可选——不传回退增量 1 行为。

**Tech Stack:** Node 22 + ts-morph 28.0.0 / Python 3.11 subprocess / FastAPI / LangGraph 1.2.6 / Spring Boot 3.3.7 / Next.js 15.5.19。

## Global Constraints

- 四层 FINAL；依赖单向向下；跨层 REST/JSON 驼峰。
- Python 经 `subprocess.run(["node", extract.js, repo_path], check=True, capture_output=True, text=True)` 调用，json.loads stdout。
- ts-morph 28.0.0；extract.js 用尽调验证版（compilerOptions: jsx:2, moduleResolution:100, skipFileDependencyResolution:true）。
- node_modules 不提交，提交 package-lock.json，setup 用 `npm ci`。
- repoPath 可选：无 repoPath / node 不可用 / 抽取失败 → 回退占位 context，/runs 绝不 500。
- 增量 1 的 8 个 Python 测试必须继续通过。
- 契约 IntentRequest 加可选 repoPath；RunResult 加可选 graphStats{fileCount,componentCount,importCount}。四处镜像。
- Python venv: ai-runtime/.venv (Windows: .venv/Scripts/python)。

---

### Task 1: tools/ts-extractor（Node 抽取器）

**Files:**
- Create: `tools/ts-extractor/extract.js`
- Create: `tools/ts-extractor/package.json`
- Create: `tools/ts-extractor/.gitignore`
- Create: `test/fixtures/next-app/` 样本（app/layout.tsx, app/page.tsx, components/Button.tsx, components/Card.tsx）

**Interfaces:**
- Consumes: 无
- Produces: `node extract.js <dir>` → stdout JSON `{nodes:[{id,type,...}], edges:[{type,from,to,...}]}`；File/Component 节点，IMPORTS/DEFINES 边。

- [ ] **Step 1: 写 tools/ts-extractor/package.json**

```json
{
  "name": "evocode-ts-extractor",
  "version": "0.0.0",
  "private": true,
  "description": "ts-morph based TS/React graph extractor for EvoCode PKG",
  "bin": { "evocode-extract": "extract.js" },
  "dependencies": { "ts-morph": "28.0.0" }
}
```

- [ ] **Step 2: 写 tools/ts-extractor/.gitignore**

```
node_modules/
```

- [ ] **Step 3: 写 tools/ts-extractor/extract.js**（尽调验证版，逐字）

```js
#!/usr/bin/env node
/**
 * extract.js - Minimal TypeScript/TSX graph extractor using ts-morph
 * Usage: node extract.js <directory-path>
 * Outputs: JSON { nodes: [...], edges: [...] } to STDOUT
 */

const { Project, SyntaxKind } = require("ts-morph");
const path = require("path");

const targetDir = process.argv[2];
if (!targetDir) {
  process.stderr.write("Usage: node extract.js <directory-path>\n");
  process.exit(1);
}

const project = new Project({
  compilerOptions: {
    allowJs: false,
    jsx: 2, // React
    target: 99, // ESNext
    moduleResolution: 100, // Bundler
    esModuleInterop: true,
  },
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

project.addSourceFilesAtPaths([
  path.join(targetDir, "**/*.ts"),
  path.join(targetDir, "**/*.tsx"),
]);

const nodes = [];
const edges = [];

function hasJsxReturn(node) {
  const jsxKinds = new Set([
    SyntaxKind.JsxElement,
    SyntaxKind.JsxSelfClosingElement,
    SyntaxKind.JsxFragment,
  ]);
  let found = false;
  node.forEachDescendant?.((child) => {
    if (jsxKinds.has(child.getKind())) {
      found = true;
    }
  });
  return found;
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  const fileId = `file:${filePath}`;
  nodes.push({ id: fileId, type: "File", path: filePath });

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    if (hasJsxReturn(fn)) {
      const compId = `component:${filePath}#${name}`;
      nodes.push({ id: compId, type: "Component", name, filePath });
      edges.push({ type: "DEFINES", from: fileId, to: compId });
    }
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName();
    const init = varDecl.getInitializer();
    if (!init) continue;
    const kind = init.getKind();
    const isArrowOrFn =
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression;
    if (isArrowOrFn && hasJsxReturn(init)) {
      const compId = `component:${filePath}#${name}`;
      nodes.push({ id: compId, type: "Component", name, filePath });
      edges.push({ type: "DEFINES", from: fileId, to: compId });
    }
  }

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declNode = defaultExport.getDeclarations()[0];
    if (declNode) {
      const name =
        declNode.getName?.() ||
        defaultExport.getName() ||
        path.basename(filePath, path.extname(filePath));
      const alreadyAdded = nodes.some(
        (n) =>
          n.type === "Component" &&
          n.filePath === filePath &&
          n.name === name
      );
      if (!alreadyAdded) {
        const compId = `component:${filePath}#${name}(default)`;
        nodes.push({
          id: compId,
          type: "Component",
          name: `${name}(default)`,
          filePath,
        });
        edges.push({ type: "DEFINES", from: fileId, to: compId });
      }
    }
  }

  for (const imp of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = imp.getModuleSpecifierValue();
    if (!moduleSpecifier.startsWith(".")) continue;
    const importedFile = imp.getModuleSpecifierSourceFile();
    if (importedFile) {
      const importedPath = importedFile.getFilePath();
      edges.push({
        type: "IMPORTS",
        from: fileId,
        to: `file:${importedPath}`,
        specifier: moduleSpecifier,
      });
    }
  }
}

process.stdout.write(JSON.stringify({ nodes, edges }, null, 2) + "\n");
```

- [ ] **Step 4: 写 fixture test/fixtures/next-app/app/layout.tsx**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: 写 fixture components/Button.tsx**

```tsx
export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}
```

- [ ] **Step 6: 写 fixture components/Card.tsx**

```tsx
export const Card = ({ title }: { title: string }) => {
  return <div className="card"><h3>{title}</h3></div>;
};
```

- [ ] **Step 7: 写 fixture app/page.tsx**

```tsx
import { Button } from "../components/Button";
import { Card } from "../components/Card";

export default function Page() {
  return (
    <main>
      <Card title="Welcome" />
      <Button label="Click" />
    </main>
  );
}
```

- [ ] **Step 8: 安装依赖并实跑抽取器验证**

Run:
```bash
cd tools/ts-extractor && npm install && node extract.js ../../test/fixtures/next-app
```
Expected: 输出 JSON，含 4 个 File 节点、Component 节点（RootLayout、Page、Button、Card 等）、IMPORTS 边（page→Button、page→Card）。确认 stdout 是合法 JSON。

- [ ] **Step 9: Commit**（注意 package-lock.json 提交，node_modules 不提交）

```bash
git add tools/ts-extractor/extract.js tools/ts-extractor/package.json tools/ts-extractor/package-lock.json tools/ts-extractor/.gitignore test/fixtures/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(tools): ts-morph TS/React graph extractor + next-app fixture"
```

---

### Task 2: Python PKG 模块 + understand 接入

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py`（IntentRequest 加 repoPath；RunResult 加 graphStats）
- Create: `ai-runtime/src/evocode_runtime/pkg/__init__.py`
- Create: `ai-runtime/src/evocode_runtime/pkg/extractor.py`
- Create: `ai-runtime/src/evocode_runtime/pkg/graph.py`
- Modify: `ai-runtime/src/evocode_runtime/graph/state.py`（RunState 加 repoPath）
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py`（understand 接真实 PKG）
- Modify: `ai-runtime/src/evocode_runtime/run_service.py`（透传 repoPath；RunResult 填 graphStats）
- Modify: `ai-runtime/src/evocode_runtime/main.py`（/runs 透传 repoPath）
- Modify: `ai-runtime/src/evocode_runtime/llm/stub_provider.py`（plan 参考 context 图）
- Test: `ai-runtime/tests/test_project_graph.py`
- Test: `ai-runtime/tests/test_extractor.py`
- Test: `ai-runtime/tests/test_understand.py`
- Modify: `ai-runtime/tests/test_run_service.py`（加带 repoPath 用例）

**Interfaces:**
- Consumes: Task 1 的 extract.js；contracts。
- Produces:
  - `models.IntentRequest` 加 `repo_path: str | None = Field(default=None, alias="repoPath")`。
  - `models.ProjectGraphStats(file_count,component_count,import_count)` alias 驼峰；`RunResult` 加 `graph_stats: ProjectGraphStats | None = Field(default=None, alias="graphStats")`。
  - `pkg.extractor.TsExtractor.extract(repo_path)->dict`、`.is_available()->bool`、`ExtractionError`。
  - `pkg.graph.ProjectGraph(nodes,edges)`：`files()`,`components()`,`imports_of(fid)`,`stats()`,`to_context(project_id)`。

- [ ] **Step 1: models.py 升级**

IntentRequest 改为（保留现有 intent/project_id）：
```python
class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")
    repo_path: str | None = Field(default=None, alias="repoPath")
```
新增 ProjectGraphStats，并给 RunResult 加可选 graph_stats：
```python
class ProjectGraphStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    file_count: int = Field(alias="fileCount")
    component_count: int = Field(alias="componentCount")
    import_count: int = Field(alias="importCount")
```
RunResult 增加字段：
```python
    graph_stats: "ProjectGraphStats | None" = Field(default=None, alias="graphStats")
```
（确保 RunResult.model_config 已有 populate_by_name=True）

- [ ] **Step 2: 写 pkg/graph.py（先写测试 test_project_graph.py）**

测试：
```python
from evocode_runtime.pkg.graph import ProjectGraph

NODES = [
    {"id": "file:/a/page.tsx", "type": "File", "path": "/a/page.tsx"},
    {"id": "file:/a/Button.tsx", "type": "File", "path": "/a/Button.tsx"},
    {"id": "component:/a/page.tsx#Page", "type": "Component", "name": "Page", "filePath": "/a/page.tsx"},
    {"id": "component:/a/Button.tsx#Button", "type": "Component", "name": "Button", "filePath": "/a/Button.tsx"},
]
EDGES = [
    {"type": "IMPORTS", "from": "file:/a/page.tsx", "to": "file:/a/Button.tsx", "specifier": "./Button"},
    {"type": "DEFINES", "from": "file:/a/page.tsx", "to": "component:/a/page.tsx#Page"},
    {"type": "DEFINES", "from": "file:/a/Button.tsx", "to": "component:/a/Button.tsx#Button"},
]


def test_files_and_components():
    pg = ProjectGraph(NODES, EDGES)
    assert len(pg.files()) == 2
    assert len(pg.components()) == 2


def test_imports_of():
    pg = ProjectGraph(NODES, EDGES)
    assert pg.imports_of("file:/a/page.tsx") == ["file:/a/Button.tsx"]


def test_stats():
    pg = ProjectGraph(NODES, EDGES)
    s = pg.stats()
    assert s == {"fileCount": 2, "componentCount": 2, "importCount": 1}


def test_to_context():
    pg = ProjectGraph(NODES, EDGES)
    ctx = pg.to_context("demo")
    assert ctx["projectId"] == "demo"
    assert ctx["stats"]["componentCount"] == 2
    assert len(ctx["graph"]["nodes"]) == 4
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_project_graph.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 写 pkg/graph.py**

```python
class ProjectGraph:
    """内存项目知识图谱：File/Component 节点 + IMPORTS/DEFINES 边的结构查询。"""

    def __init__(self, nodes: list[dict], edges: list[dict]) -> None:
        self._nodes = nodes
        self._edges = edges

    def files(self) -> list[dict]:
        return [n for n in self._nodes if n.get("type") == "File"]

    def components(self) -> list[dict]:
        return [n for n in self._nodes if n.get("type") == "Component"]

    def imports_of(self, file_id: str) -> list[str]:
        return [e["to"] for e in self._edges
                if e.get("type") == "IMPORTS" and e.get("from") == file_id]

    def stats(self) -> dict:
        return {
            "fileCount": len(self.files()),
            "componentCount": len(self.components()),
            "importCount": sum(1 for e in self._edges if e.get("type") == "IMPORTS"),
        }

    def to_context(self, project_id: str) -> dict:
        return {
            "projectId": project_id,
            "graph": {"nodes": self._nodes, "edges": self._edges},
            "stats": self.stats(),
        }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_project_graph.py -v`
Expected: 4 passed。

- [ ] **Step 6: 写 pkg/extractor.py**

```python
import json
import os
import shutil
import subprocess
from pathlib import Path


class ExtractionError(Exception):
    pass


def _default_extractor_js() -> str:
    # 仓库根: ai-runtime/src/evocode_runtime/pkg/extractor.py → 上溯 4 层到 repo 根
    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    return str(repo_root / "tools" / "ts-extractor" / "extract.js")


class TsExtractor:
    """经 subprocess 调用 Node ts-morph 抽取器，返回 {nodes,edges}。"""

    def __init__(self, extractor_js: str | None = None) -> None:
        self.extractor_js = extractor_js or os.environ.get(
            "EVOCODE_EXTRACTOR_JS", _default_extractor_js())

    @staticmethod
    def node_available() -> bool:
        return shutil.which("node") is not None

    def is_available(self) -> bool:
        js = Path(self.extractor_js)
        return (self.node_available()
                and js.is_file()
                and (js.parent / "node_modules").is_dir())

    def extract(self, repo_path: str) -> dict:
        if not self.is_available():
            raise ExtractionError("node or extractor not available")
        if not os.path.isdir(repo_path):
            raise ExtractionError(f"not a directory: {repo_path}")
        try:
            proc = subprocess.run(
                ["node", self.extractor_js, repo_path],
                capture_output=True, text=True, check=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise ExtractionError(f"extractor failed: {exc}") from exc
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise ExtractionError(f"invalid extractor output: {exc}") from exc
```

- [ ] **Step 7: 写 pkg/__init__.py**

```python
from evocode_runtime.pkg.extractor import TsExtractor, ExtractionError
from evocode_runtime.pkg.graph import ProjectGraph

__all__ = ["TsExtractor", "ExtractionError", "ProjectGraph"]
```

- [ ] **Step 8: 写 extractor 集成测试 tests/test_extractor.py**

```python
import os
import shutil
import pytest
from pathlib import Path
from evocode_runtime.pkg import TsExtractor, ProjectGraph

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "test" / "fixtures" / "next-app"

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node or ts-extractor node_modules not available")


@requires_node
def test_extract_fixture():
    ex = TsExtractor()
    assert ex.is_available()
    raw = ex.extract(str(FIXTURE))
    pg = ProjectGraph(raw["nodes"], raw["edges"])
    assert len(pg.files()) >= 4
    assert len(pg.components()) >= 4
    s = pg.stats()
    assert s["importCount"] >= 2  # page imports Button + Card
```

- [ ] **Step 9: 跑 extractor 测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_extractor.py -v`
Expected: 1 passed（node_modules 已在 Task1 装好）。

- [ ] **Step 10: graph/state.py 加 repoPath**

```python
class RunState(TypedDict):
    intent: str
    projectId: str
    repoPath: str  # 空串表示未提供
    context: dict
    phase: str
    tasks: list
```

- [ ] **Step 11: graph/nodes.py — understand 接真实 PKG**

```python
import os
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway
from evocode_runtime.pkg import TsExtractor, ProjectGraph, ExtractionError

_PLACEHOLDER_STATS = {"fileCount": 0, "componentCount": 0, "importCount": 0}


def understand_node(state: RunState) -> dict:
    repo_path = state.get("repoPath") or ""
    if repo_path and os.path.isdir(repo_path):
        extractor = TsExtractor()
        if extractor.is_available():
            try:
                raw = extractor.extract(repo_path)
                pg = ProjectGraph(raw["nodes"], raw["edges"])
                return {"context": pg.to_context(state["projectId"]), "phase": "understood"}
            except ExtractionError:
                pass
    return {
        "context": {"projectId": state["projectId"],
                    "graph": {"nodes": [], "edges": []},
                    "stats": dict(_PLACEHOLDER_STATS)},
        "phase": "understood",
    }


def plan_node(state: RunState) -> dict:
    gateway = get_llm_gateway()
    tasks = gateway.plan(state["intent"], state.get("context") or {})
    return {"tasks": [t.model_dump() for t in tasks], "phase": "planned"}
```

- [ ] **Step 12: stub_provider.py — plan 参考 context 图**

在 StubLlmProvider.plan 中，frontend 任务描述追加现有组件数（确定性）：
```python
    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        low = intent.lower()
        stats = (context or {}).get("stats") or {}
        comp_n = stats.get("componentCount", 0)
        tasks: list[EngineeringTask] = []
        n = 0
        if any(k in low for k in _FRONTEND_KW):
            n += 1
            extra = f"（项目现有 {comp_n} 个组件）" if comp_n else ""
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现前端界面", kind="frontend",
                description=f"为意图实现 React/Next.js 界面：{intent}{extra}"))
        # backend / generic / test 同增量1
        ...
```
保留 backend/generic/test 逻辑不变（按原计划）。确定性不变。

- [ ] **Step 13: run_service.py 透传 repoPath + 填 graphStats**

```python
from evocode_runtime.models import RunResult, TaskGraph, EngineeringTask, ProjectGraphStats

    def execute(self, intent: str, project_id: str, repo_path: str = "") -> RunResult:
        run_id = str(uuid4())
        config = {"configurable": {"thread_id": run_id}}
        try:
            final = _graph.invoke(
                {"intent": intent, "projectId": project_id, "repoPath": repo_path,
                 "context": {}, "phase": "", "tasks": []},
                config=config)
            tasks = [EngineeringTask(**t) for t in final.get("tasks", [])]
            stats = (final.get("context") or {}).get("stats") or {}
            gs = ProjectGraphStats(
                fileCount=stats.get("fileCount", 0),
                componentCount=stats.get("componentCount", 0),
                importCount=stats.get("importCount", 0))
            return RunResult(
                runId=run_id, status="completed", phase=final.get("phase", "planned"),
                taskGraph=TaskGraph(tasks=tasks), graphStats=gs,
                message=f"Planned {len(tasks)} task(s) for project {project_id}")
        except Exception as exc:  # noqa: BLE001
            return RunResult(
                runId=run_id, status="failed", phase="failed",
                taskGraph=TaskGraph(tasks=[]), graph_stats=None,
                message="Run failed")
```
（注意：失败消息改为通用 "Run failed"，顺带处理增量1 评审债务 #2）

- [ ] **Step 14: main.py /runs 透传 repoPath**

```python
@app.post("/runs", response_model=RunResult, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunResult:
    return _run_service.execute(req.intent, req.project_id, req.repo_path or "")
```

- [ ] **Step 15: 写 understand 测试 tests/test_understand.py**

```python
import shutil
import pytest
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


def test_understand_placeholder_without_repo():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["fileCount"] == 0
    assert out["phase"] == "understood"


@requires_node
def test_understand_real_pkg_with_repo():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["fileCount"] >= 4
    assert out["context"]["stats"]["componentCount"] >= 4
```

- [ ] **Step 16: test_run_service.py 加带 repoPath 用例**

```python
import shutil
from pathlib import Path
from evocode_runtime.run_service import RunService

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_execute_without_repo_still_works():
    result = RunService().execute("add a comments api endpoint", "demo")
    assert result.status == "completed"
    assert result.graph_stats.file_count == 0


def test_execute_with_repo_populates_graphstats():
    import pytest
    if not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()):
        pytest.skip("node/ts-extractor unavailable")
    result = RunService().execute("add a product page", "demo", FIXTURE)
    assert result.status == "completed"
    assert result.graph_stats.file_count >= 4
```
（保留增量1 原有 test_execute_returns_completed_runresult）

- [ ] **Step 17: 跑全部 Python 测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -v`
Expected: 全绿（增量1 的 8 + project_graph 4 + extractor 1 + understand 2 + run_service 新增）。

- [ ] **Step 18: Commit**

```bash
git add ai-runtime/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): real PKG via ts-morph extractor in understand node"
```

---

### Task 3: Java + 前端 + 契约镜像

**Files:**
- Modify: `contracts/intent.schema.json`（IntentRequest 加 repoPath；新增 ProjectGraphStats；RunResult 加 graphStats）
- Modify: `control-plane/.../dto/IntentRequest.java`（加 repoPath）
- Create: `control-plane/.../dto/ProjectGraphStats.java`
- Modify: `control-plane/.../dto/RunResult.java`（加 graphStats）
- Modify: `frontend/src/types/intent.ts`（加 repoPath + ProjectGraphStats + RunResult.graphStats）
- Modify: `frontend/src/app/page.tsx`（可选输入 repoPath，渲染 graphStats）

**Interfaces:**
- Consumes: 升级后的契约。
- Produces: 网关透传 repoPath/graphStats；前端可传 repoPath 并展示图统计。

- [ ] **Step 1: contracts/intent.schema.json**

IntentRequest properties 加 `"repoPath": {"type":"string"}`（不加入 required）。新增定义：
```json
"ProjectGraphStats": {
  "type": "object",
  "required": ["fileCount", "componentCount", "importCount"],
  "properties": {
    "fileCount": {"type": "integer"},
    "componentCount": {"type": "integer"},
    "importCount": {"type": "integer"}
  }
}
```
RunResult properties 加 `"graphStats": {"$ref": "#/definitions/ProjectGraphStats"}`（不加入 required，可选）。

- [ ] **Step 2: IntentRequest.java 加 repoPath**

```java
package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

public record IntentRequest(
    @NotBlank String intent,
    @NotBlank String projectId,
    String repoPath
) {}
```

- [ ] **Step 3: 写 ProjectGraphStats.java**

```java
package com.evocode.controlplane.dto;

public record ProjectGraphStats(
    int fileCount,
    int componentCount,
    int importCount
) {}
```

- [ ] **Step 4: RunResult.java 加 graphStats**

```java
package com.evocode.controlplane.dto;

public record RunResult(
    String runId,
    String status,
    String phase,
    TaskGraph taskGraph,
    ProjectGraphStats graphStats,
    String message
) {}
```

- [ ] **Step 5: 编译 + 测试**

Run: `cd control-plane && mvn -q compile && mvn -q test`
Expected: BUILD SUCCESS，contextLoads 通过。

- [ ] **Step 6: frontend types/intent.ts**

```typescript
export interface IntentRequest {
  intent: string;
  projectId: string;
  repoPath?: string;
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

export interface ProjectGraphStats {
  fileCount: number;
  componentCount: number;
  importCount: number;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed";
  phase: string;
  taskGraph: TaskGraph;
  graphStats?: ProjectGraphStats;
  message: string;
}
```

- [ ] **Step 7: frontend page.tsx — 加 repoPath 输入 + 渲染 graphStats**

在表单加一个可选 repoPath 输入；提交时带上；结果区渲染 graphStats（若有）：
```tsx
// 状态加: const [repoPath, setRepoPath] = useState("");
// submitIntent({ intent, projectId, repoPath: repoPath || undefined })
// 结果区在任务列表前加：
{result?.graphStats && (
  <p>项目图：{result.graphStats.fileCount} 文件 / {result.graphStats.componentCount} 组件 / {result.graphStats.importCount} import</p>
)}
// 表单加一个 input：
// <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="目标仓库路径（可选）" />
```

- [ ] **Step 8: 前端构建**

Run: `cd frontend && pnpm build`
Expected: 成功，无类型错误。

- [ ] **Step 9: Commit**

```bash
git add contracts/ control-plane/ frontend/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat: propagate repoPath and graphStats across contract, gateway, frontend"
```

---

### Task 4: 端到端联调

**Files:**
- Modify: `README.md`（补 repoPath/PKG 的 e2e 示例）

**Interfaces:**
- Consumes: Task 1-3 全部。
- Produces: 文档化的真实 PKG 端到端证据。

- [ ] **Step 1: 启动 Python + Java**（主会话管控，后台启动）

- [ ] **Step 2: 带 repoPath 的端到端**

Run:
```bash
curl -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"<abs path to test/fixtures/next-app>"}'
```
Expected: 返回 RunResult，`graphStats` 非零（fileCount>=4, componentCount>=4），taskGraph 含 frontend 任务且描述引用现有组件数。

- [ ] **Step 3: 不带 repoPath 回退**

Run: `curl ... -d '{"intent":"add api","projectId":"x"}'`
Expected: graphStats 全 0，仍 completed（增量1 行为保持）。

- [ ] **Step 4: 停服务，README 补 PKG e2e 示例，Commit**

```bash
git add README.md
git -c user.name="evocode" -c user.email="evocode@local" commit -m "docs: increment 2 verified e2e — real PKG extraction"
```

---

## Self-Review

**Spec coverage:** §3 tools/ts-extractor→T1；§5 PKG 模块→T2(extractor/graph)；§6 understand 改造→T2(Step11)；§4 契约+跨层→T3；§7 测试→T2(project_graph/extractor/understand/run_service)、T3(context/build)；§8 风险(回退/守卫)→T2(understand 守卫+回退)。✓
**Placeholder scan:** extract.js 用尽调验证版逐字；各步含完整代码/命令。stub_provider Step12 标注"backend/generic/test 同增量1"——这是引用同文件已有逻辑，非跨任务占位，实现者在同一文件可见。✓
**Type consistency:** repoPath（IntentRequest 四处）、graphStats/ProjectGraphStats（fileCount/componentCount/importCount 四处镜像）；Pydantic alias 驼峰。✓
**回归保护:** repoPath 可选，无 repoPath/node 不可用/抽取失败均回退占位，增量1 的 8 测试不破坏（Step17 全跑）。✓
**顺带还债:** run_service 失败消息改通用 "Run failed"（增量1 评审债务 #2）。✓
