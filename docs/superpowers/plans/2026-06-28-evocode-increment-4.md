# EvoCode 增量 4 — 图分析（影响/依赖）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** ProjectGraph 增加影响/依赖分析（基于 IMPORTS 传递闭包），understand 把"最大影响面"纳入 stats，Planner 据此做结构化规划。纯 Python，确定性，零外部依赖。

**Architecture:** 四层 FINAL 不变。分析在内存 ProjectGraph 上跑（数据来源仍是缓存/抽取）。契约 ProjectGraphStats +maxImpactCount。

**Tech Stack:** Python 3.11（collections.deque）/ FastAPI / Spring Boot 3.3.7 / Next.js 15.5.19。

## Global Constraints

- 四层 FINAL；依赖单向向下。
- 边方向语义：`from → to` = "from 依赖 to"。IMPORTS：导入方 from → 被导入 to。dependencies_of = 正向(out)可达；impact_of = 反向(in)可达。
- 确定性：所有列表结果按 node_id 排序；BFS visited 去重（容忍环）。
- 只到文件级 IMPORTS 传递闭包。
- 契约 ProjectGraphStats +maxImpactCount(int,默认0)，四处镜像。
- 增量1/2/3 的 36 测试继续通过。
- venv: ai-runtime/.venv (Windows: .venv/Scripts/python)。

---

### Task 1: ProjectGraph 图分析 API

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/pkg/graph.py`
- Test: `ai-runtime/tests/test_graph_analysis.py`

**Interfaces:**
- Consumes: 图 dict（nodes/edges，增量2 形状）。
- Produces:
  - `ProjectGraph.dependencies_of(file_id, max_depth=None) -> list[str]`（排序）
  - `ProjectGraph.impact_of(file_id, max_depth=None) -> list[str]`（排序）
  - `ProjectGraph.components_in(file_id) -> list[dict]`
  - `ProjectGraph.find_file_by_suffix(suffix) -> str | None`
  - `ProjectGraph.analysis_summary() -> dict`（{maxImpactFile, maxImpactCount}）

- [ ] **Step 1: 写 test_graph_analysis.py（失败先行）**

```python
from evocode_runtime.pkg.graph import ProjectGraph

# A imports B, B imports C  (链)
NODES = [
    {"id": "file:/A.tsx", "type": "File", "path": "/A.tsx"},
    {"id": "file:/B.tsx", "type": "File", "path": "/B.tsx"},
    {"id": "file:/C.tsx", "type": "File", "path": "/C.tsx"},
    {"id": "comp:/A.tsx#A", "type": "Component", "name": "A", "filePath": "/A.tsx"},
]
EDGES = [
    {"type": "IMPORTS", "from": "file:/A.tsx", "to": "file:/B.tsx"},
    {"type": "IMPORTS", "from": "file:/B.tsx", "to": "file:/C.tsx"},
    {"type": "DEFINES", "from": "file:/A.tsx", "to": "comp:/A.tsx#A"},
]


def test_dependencies_of_transitive():
    pg = ProjectGraph(NODES, EDGES)
    # A 依赖 B 和 C（传递）
    assert pg.dependencies_of("file:/A.tsx") == ["file:/B.tsx", "file:/C.tsx"]


def test_dependencies_of_depth_limit():
    pg = ProjectGraph(NODES, EDGES)
    # 限深 1：A 只直接依赖 B
    assert pg.dependencies_of("file:/A.tsx", max_depth=1) == ["file:/B.tsx"]


def test_impact_of_transitive():
    pg = ProjectGraph(NODES, EDGES)
    # 改 C 波及 B 和 A（反向传递）
    assert pg.impact_of("file:/C.tsx") == ["file:/A.tsx", "file:/B.tsx"]


def test_impact_of_leaf():
    pg = ProjectGraph(NODES, EDGES)
    # 改 A 不波及任何人（无人导入 A）
    assert pg.impact_of("file:/A.tsx") == []


def test_components_in():
    pg = ProjectGraph(NODES, EDGES)
    comps = pg.components_in("file:/A.tsx")
    assert len(comps) == 1 and comps[0]["name"] == "A"


def test_find_file_by_suffix():
    pg = ProjectGraph(NODES, EDGES)
    assert pg.find_file_by_suffix("B.tsx") == "file:/B.tsx"
    assert pg.find_file_by_suffix("nope.tsx") is None


def test_analysis_summary():
    pg = ProjectGraph(NODES, EDGES)
    s = pg.analysis_summary()
    # C 影响面最大(2: A,B)
    assert s["maxImpactFile"] == "file:/C.tsx"
    assert s["maxImpactCount"] == 2


def test_cycle_safe():
    # A->B->A 环
    nodes = [{"id": "file:/A", "type": "File", "path": "/A"},
             {"id": "file:/B", "type": "File", "path": "/B"}]
    edges = [{"type": "IMPORTS", "from": "file:/A", "to": "file:/B"},
             {"type": "IMPORTS", "from": "file:/B", "to": "file:/A"}]
    pg = ProjectGraph(nodes, edges)
    assert pg.dependencies_of("file:/A") == ["file:/B"]  # 去重，不死循环
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_graph_analysis.py -v`
Expected: FAIL（方法不存在）。

- [ ] **Step 3: 改 graph.py — 预构建邻接 + 分析方法**

在 `__init__` 末尾构建 IMPORTS 邻接表，并新增方法：

```python
from collections import deque


class ProjectGraph:
    def __init__(self, nodes: list[dict], edges: list[dict]) -> None:
        self._nodes = nodes
        self._edges = edges
        # 预构建 IMPORTS 邻接（from 依赖 to）
        self._out: dict[str, list[str]] = {}   # from -> [to]
        self._in: dict[str, list[str]] = {}    # to -> [from]
        for e in edges:
            if e.get("type") == "IMPORTS":
                f, t = e.get("from"), e.get("to")
                self._out.setdefault(f, []).append(t)
                self._in.setdefault(t, []).append(f)

    # —— 现有 files/components/imports_of/stats/to_context 保持不变 ——

    def _reachable(self, adj: dict[str, list[str]], start: str, max_depth: int | None) -> list[str]:
        visited: set[str] = set()
        queue: deque[tuple[str, int]] = deque((n, 1) for n in adj.get(start, []))
        while queue:
            node, depth = queue.popleft()
            if node in visited:
                continue
            visited.add(node)
            if max_depth is None or depth < max_depth:
                for nxt in adj.get(node, []):
                    if nxt not in visited:
                        queue.append((nxt, depth + 1))
        return sorted(visited)

    def dependencies_of(self, file_id: str, max_depth: int | None = None) -> list[str]:
        """file_id (传递) 依赖的文件（沿 IMPORTS 正向）。"""
        return self._reachable(self._out, file_id, max_depth)

    def impact_of(self, file_id: str, max_depth: int | None = None) -> list[str]:
        """改 file_id 会 (传递) 波及的文件（沿 IMPORTS 反向）。"""
        return self._reachable(self._in, file_id, max_depth)

    def components_in(self, file_id: str) -> list[dict]:
        defined = {e["to"] for e in self._edges
                   if e.get("type") == "DEFINES" and e.get("from") == file_id}
        return [n for n in self._nodes if n.get("id") in defined and n.get("type") == "Component"]

    def find_file_by_suffix(self, suffix: str) -> str | None:
        for n in self._nodes:
            if n.get("type") == "File" and str(n.get("path", "")).endswith(suffix):
                return n.get("id")
        return None

    def analysis_summary(self) -> dict:
        max_file, max_count = None, 0
        for n in self._nodes:
            if n.get("type") != "File":
                continue
            cnt = len(self.impact_of(n["id"]))
            if cnt > max_count:
                max_file, max_count = n["id"], cnt
        return {"maxImpactFile": max_file, "maxImpactCount": max_count}
```

> 注意 max_depth 语义：depth 从 1 开始计（直接邻居 depth=1）。限深 1 = 只直接邻居。`depth < max_depth` 控制是否继续扩展。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_graph_analysis.py -v`
Expected: 8 passed。

- [ ] **Step 5: 跑全套确认无回归**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: 44 passed（36 + 8）。

- [ ] **Step 6: Commit**

```bash
git add ai-runtime/src/evocode_runtime/pkg/graph.py ai-runtime/tests/test_graph_analysis.py
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): impact/dependency analysis on ProjectGraph"
```

---

### Task 2: understand 纳入分析摘要 + Planner + 契约

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py`（ProjectGraphStats +maxImpactCount）
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py`（understand 合并 analysis_summary 进 stats）
- Modify: `ai-runtime/src/evocode_runtime/llm/stub_provider.py`（用 maxImpactCount）
- Modify: `ai-runtime/src/evocode_runtime/run_service.py`（graphStats 填 maxImpactCount）
- Test: `ai-runtime/tests/test_understand_analysis.py`

**Interfaces:**
- Consumes: Task 1 的 analysis_summary。
- Produces: `ProjectGraphStats.max_impact_count`（alias maxImpactCount，默认 0）；context.stats 含 maxImpactCount。

- [ ] **Step 1: models.py 加字段**

ProjectGraphStats 增加：
```python
    max_impact_count: int = Field(default=0, alias="maxImpactCount")
```

- [ ] **Step 2: graph/nodes.py — understand 合并分析摘要**

在两处构建真实图的分支（hit 与 miss），把 analysis_summary 合并进 to_context 的 extra_stats。改为先构建 pg，再：
```python
        # hit 分支
        pg = ProjectGraph(graph["nodes"], graph["edges"])
        summary = pg.analysis_summary()
        return {"context": pg.to_context(project_id,
                    {"cacheHit": True, "graphVersionId": vid,
                     "maxImpactCount": summary["maxImpactCount"]}),
                "phase": "understood"}
```
miss 分支同理（cacheHit=False, graphVersionId=new_vid, maxImpactCount=summary[...]）。占位分支 _PLACEHOLDER_STATS 加 `"maxImpactCount": 0`。

- [ ] **Step 3: stub_provider.py — 用 maxImpactCount**

frontend/backend 任务描述追加影响面（确定性）：
```python
        max_impact = stats.get("maxImpactCount", 0)
        impact_note = f"（最大影响面 {max_impact} 文件）" if max_impact else ""
```
拼到 frontend 与 backend 任务的 description 末尾（generic/test 不加）。保留 comp_n 逻辑。

- [ ] **Step 4: run_service.py — graphStats 填 maxImpactCount**

ProjectGraphStats 构造加 `maxImpactCount=stats.get("maxImpactCount", 0)`。

- [ ] **Step 5: 写 test_understand_analysis.py**

```python
import shutil, pytest
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


@requires_node
def test_understand_includes_max_impact(tmp_path, monkeypatch):
    monkeypatch.setenv("EVOCODE_PKG_DB", str(tmp_path / "data" / "pkg.db"))
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
                           "context": {}, "phase": "", "tasks": []})
    # fixture: page imports Button + Card → Button/Card impact=1; maxImpactCount=1
    assert out["context"]["stats"]["maxImpactCount"] >= 1


def test_placeholder_max_impact_zero():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["maxImpactCount"] == 0
```

- [ ] **Step 6: 跑全套**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -q`
Expected: 46 passed（44 + 2）。DB 用 tmp 隔离，不污染 data/。

- [ ] **Step 7: Commit**

```bash
git add ai-runtime/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): surface maxImpactCount in understand stats and planning"
```

---

### Task 3: 契约镜像（Java + 前端 + schema）

**Files:**
- Modify: `contracts/intent.schema.json`
- Modify: `control-plane/.../dto/ProjectGraphStats.java`
- Modify: `frontend/src/types/intent.ts`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: 升级后的 ProjectGraphStats。
- Produces: 四处镜像；前端展示 maxImpactCount。

- [ ] **Step 1: contracts/intent.schema.json**

ProjectGraphStats properties 加 `"maxImpactCount": {"type": "integer"}`。required 不变（可选）。验证 JSON 解析。

- [ ] **Step 2: ProjectGraphStats.java 加字段**

```java
public record ProjectGraphStats(
    int fileCount,
    int componentCount,
    int importCount,
    Boolean cacheHit,
    Integer graphVersionId,
    Integer maxImpactCount
) {}
```

- [ ] **Step 3: 编译 + 测试**

Run: `cd control-plane && mvn -q compile && mvn -q test`
Expected: BUILD SUCCESS。

- [ ] **Step 4: frontend types/intent.ts**

ProjectGraphStats 接口加 `maxImpactCount?: number;`

- [ ] **Step 5: frontend page.tsx**

graphStats 渲染行追加 `· 最大影响面 {result.graphStats.maxImpactCount ?? 0} 文件`。

- [ ] **Step 6: 前端构建**

Run: `cd frontend && pnpm build`
Expected: 成功。

- [ ] **Step 7: Commit**

```bash
git add contracts/ control-plane/ frontend/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat: propagate maxImpactCount across contract, gateway, frontend"
```

---

### Task 4: 端到端联调

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1-3。
- Produces: 文档化的图分析端到端证据。

- [ ] **Step 1: 启动 Python + Java（主会话管控，清 DB 从干净开始）**

- [ ] **Step 2: 带 repoPath 请求**

Run:
```bash
curl -s -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"E:/evocode/test/fixtures/next-app"}'
```
Expected: graphStats.maxImpactCount >= 1（fixture: Button/Card 各被 page 导入，impact=1）。任务描述含"最大影响面"。

- [ ] **Step 3: 停服务，清 DB，README 补图分析 e2e，Commit**

```bash
rm -f ai-runtime/data/pkg.db ai-runtime/data/pkg.db-wal ai-runtime/data/pkg.db-shm
git add README.md
git -c user.name="evocode" -c user.email="evocode@local" commit -m "docs: increment 4 verified e2e — impact analysis in planning"
```

---

## Self-Review

**Spec coverage:** §3/§4 图分析→T1；§5 understand+Planner+契约 Pydantic→T2；§5 契约 schema/Java/TS→T3；§6 测试→T1(graph_analysis 8)+T2(understand_analysis 2)；§7 风险(方向/环/确定性)→T1 测试(test_impact_of_leaf/test_cycle_safe/排序)。✓
**Placeholder scan:** 各步含完整代码/命令。✓
**Type consistency:** maxImpactCount(int) 四处镜像：schema/Pydantic(alias)/Java(Integer)/TS(可选)。✓
**方向语义:** test_dependencies_of(A依赖B,C) vs test_impact_of(改C波及A,B) 钉死方向。✓
**回归:** 增量1/2/3 的 36 测试 + 新增，Step6 全跑；DB tmp 隔离。✓
**确定性:** _reachable 返回 sorted；visited 去重容环(test_cycle_safe)。✓
