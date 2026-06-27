# EvoCode 增量 2 — 真实 PKG：TypeScript/React 抽取器（内存图）设计文档

> 状态：自主推进（loop/goal 模式），AI 自主决策
> 日期：2026-06-28
> 前置：增量 1 已合并（LangGraph understand→plan 流水线，understand 产出占位 context）

## 1. 背景

增量 1 的 understand 节点产出**占位 context**（只回显 projectId）。增量 2 让 understand 变真：接收一个目标仓库路径，抽取 React/Next.js 的真实结构（文件、组件、import 关系），建一个**内存中的项目知识图谱（SubGraph）**放进 RunState.context。Planner 由此从"凭关键词猜"升级为"基于真实组件树规划"。

跨语言架构（已尽调确认）：AI 运行时是 Python，TS 抽取用 Node 的 ts-morph，Python 经 **subprocess** 调用 `tools/ts-extractor/extract.js`。

## 2. 范围与边界

### 目标

- 新增 `tools/ts-extractor/`：Node + ts-morph 28.0.0 抽取器，吃目录路径，吐 `{nodes,edges}` JSON。节点 File/Component，边 IMPORTS/DEFINES。
- Python 侧 `pkg/` 模块：`TsExtractor`（subprocess 调用 Node）+ `ProjectGraph`（内存图，结构查询）。
- understand 节点：若 IntentRequest 带 `repoPath` 且路径存在，抽取真实图放进 context；否则回退到占位 context（保持增量 1 行为，无 repoPath 不破坏）。
- Planner 增强：StubLlmProvider 接收 context 中的图，规划时参考真实组件/文件（如已有组件则任务描述引用之）。
- 契约升级：IntentRequest 增加可选 `repoPath`；RunState.context 结构化为 `{projectId, graph:{nodes,edges}, stats}`。

### 明确不做（YAGNI）

- 不做 Postgres/pgvector——纯内存图。
- 不做语义检索/embedding——只结构查询（按类型筛、邻居、import 关系）。
- 不做 Java/Spring 抽取——只 TS/React（MVP 范围）。
- 不做增量重抽取/文件监听——每次 /runs 全量抽取一次。
- 不做 Route/Hook/Entity 等高级节点——只 File/Component + IMPORTS/DEFINES（最薄真实图）。
- Java 网关/前端只透传 + 渲染新字段，不解析图。

## 3. 跨层架构（新增 tools 层 + Python pkg 模块）

```
POST /runs {intent, projectId, repoPath?}
  → RunService.execute
      → graph: understand → plan
          ├─ understand_node:
          │    repoPath 有效? → TsExtractor.extract(repoPath) [subprocess node extract.js]
          │                     → ProjectGraph(nodes,edges) → context{graph, stats}
          │    否则 → 占位 context（增量1行为）
          └─ plan_node: LlmGateway.plan(intent, context) — 利用 context.graph
      → RunResult
```

### 新增/变更结构
```
tools/ts-extractor/          # 新增顶层
  extract.js                 # ts-morph 抽取器（尽调验证版）
  package.json               # ts-morph 28.0.0
  package-lock.json          # 提交，复现性
  .gitignore                 # node_modules/
ai-runtime/src/evocode_runtime/
  pkg/
    __init__.py
    extractor.py             # TsExtractor：subprocess 调 node，解析 JSON
    graph.py                 # ProjectGraph：内存图 + 结构查询
  graph/nodes.py             # understand_node 改造：接真实 PKG
  models.py                  # IntentRequest 加可选 repoPath
test/fixtures/next-app/      # 新增：被抽取的样本 Next.js 应用
```

## 4. 契约升级

`contracts/intent.schema.json`：
- `IntentRequest` 增加可选 `repoPath`（string，目标仓库绝对/相对路径）。
- 新增 `ProjectGraphStats{fileCount, componentCount, importCount}`（context 摘要，供前端展示）。
- `RunResult` 增加可选 `graphStats: ProjectGraphStats`（understand 抽取的统计，便于观测真实图已建）。

三/四处镜像同步（Pydantic/Java record/TS）。`repoPath` 可选——不传时行为同增量 1。

## 5. PKG 模块设计（Python）

### TsExtractor (pkg/extractor.py)
```python
class TsExtractor:
    def __init__(self, extractor_js: str | None = None): ...  # 默认定位 tools/ts-extractor/extract.js
    def extract(self, repo_path: str) -> dict:  # {"nodes":[...],"edges":[...]}
        # subprocess.run(["node", extractor_js, repo_path], check=True, capture_output, text)
        # json.loads(stdout); 失败抛 ExtractionError
    @staticmethod
    def is_available() -> bool:  # node 在 PATH 且 extract.js 存在且 node_modules 存在
```

### ProjectGraph (pkg/graph.py)
```python
class ProjectGraph:
    def __init__(self, nodes: list[dict], edges: list[dict]): ...
    def files(self) -> list[dict]: ...
    def components(self) -> list[dict]: ...
    def imports_of(self, file_id: str) -> list[str]: ...  # 该文件 import 的文件
    def stats(self) -> dict: ...  # {fileCount, componentCount, importCount}
    def to_context(self, project_id: str) -> dict:  # {projectId, graph:{nodes,edges}, stats}
```

## 6. understand 节点改造

```python
def understand_node(state):
    repo_path = state.get("repoPath")
    if repo_path and TsExtractor.is_available() and os.path.isdir(repo_path):
        try:
            raw = TsExtractor().extract(repo_path)
            pg = ProjectGraph(raw["nodes"], raw["edges"])
            return {"context": pg.to_context(state["projectId"]), "phase": "understood"}
        except ExtractionError:
            pass  # 回退占位
    # 占位（增量1行为）
    return {"context": {"projectId": state["projectId"], "graph": {"nodes": [], "edges": []}, "stats": {"fileCount":0,"componentCount":0,"importCount":0}}, "phase": "understood"}
```

Planner 利用 context：StubLlmProvider.plan 读 context.stats/components，若已有前端组件，frontend 任务描述引用现有组件数；保持确定性。

## 7. 测试策略

- **Node 抽取器**：tools/ts-extractor 加一个 node 自测脚本或在 Python 侧集成测试覆盖（抽取 fixture，断言节点/边数）。
- **Python pytest**：
  - ProjectGraph 单测（files/components/imports_of/stats，喂固定 nodes/edges）
  - TsExtractor 集成测试（抽取 test/fixtures/next-app，断言含 File/Component 节点、IMPORTS 边）——标记需要 node，CI 有 node
  - understand_node 测试：带 repoPath（fixture）→ 真实图；不带 → 占位回退
  - run_service：带 repoPath 的 /runs → RunResult.graphStats 非零
  - 保持增量 1 的 8 测试通过（不传 repoPath 不破坏）
- **端到端**：curl POST /api/intents 带 repoPath 指向 fixture，断言返回 graphStats（真实文件/组件数）。

## 8. 风险

- **Node 不在 PATH / node_modules 未装**：TsExtractor.is_available() 守卫 + 抽取失败回退占位，绝不让 /runs 500。需文档化 `npm ci`。
- **ts-morph 28 抽取边界**：default export 去重瑕疵（尽调记录）——本增量接受，节点名带 `(default)` 后缀可容忍。
- **跨平台路径**：Windows 路径传给 node。subprocess 用列表参数避免 shell 转义问题。
- **fixture 维护**：test/fixtures/next-app 是小样本，仅供抽取验证，不需可运行。
