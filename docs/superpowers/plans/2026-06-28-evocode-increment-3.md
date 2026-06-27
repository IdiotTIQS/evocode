# EvoCode 增量 3 — 持久化图存储（SQLite + GraphStore）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** PKG 不再每次全量抽取丢弃，而是经 GraphStore 接口持久化到 SQLite、版本化、可缓存命中。understand 节点：repo 未变则读库跳过抽取，repo 变了则抽取+存新版本+supersede 旧版本。

**Architecture:** 四层 FINAL 不变。新增 `GraphStore` 接口 + `SqliteGraphStore`（Postgres 实现为未来接口背后替换）。纯结构图，无 pgvector。仓库指纹 Option A（mtime+size）。安全回退：store 失败退化为不缓存，再不行占位，/runs 绝不 500。

**Tech Stack:** Python 3.11 sqlite3（WAL）/ FastAPI / LangGraph 1.2.6 / Spring Boot 3.3.7 / Next.js 15.5.19。

## Global Constraints

- 四层 FINAL；依赖单向向下。
- SQLite schema/指纹/版本化用 graph-store-notes.md 验证版（逐字）。
- 指纹 Option A：.ts/.tsx 的排序 (relpath, mtime_ns, size) SHA-256，排除 node_modules。
- 版本化：never-delete，status 'active'/'superseded'；新版本插入后 supersede 同 (project,repo) 其他 active。
- understand 缓存感知：命中读库不抽取；未命中抽取+存。store 异常 → 退化为抽取不缓存；抽取/路径异常 → 占位。/runs 绝不 500。
- 契约 ProjectGraphStats +cacheHit(bool) +graphVersionId(int|null)，四处镜像。
- DB 落 ai-runtime/data/pkg.db，data/ 必须 gitignore，绝不提交 DB。
- WAL + synchronous=NORMAL；每次 understand 开/关连接（不跨线程复用）。
- 增量 1/2 的 27 个 Python 测试继续通过。
- venv: ai-runtime/.venv (Windows: .venv/Scripts/python)。

---

### Task 1: GraphStore + SqliteGraphStore + 指纹

**Files:**
- Create: `ai-runtime/src/evocode_runtime/pkg/store.py`
- Modify: `ai-runtime/src/evocode_runtime/pkg/__init__.py`
- Modify: `ai-runtime/.gitignore`（或根 .gitignore 加 data/）
- Test: `ai-runtime/tests/test_store.py`
- Test: `ai-runtime/tests/test_fingerprint.py`

**Interfaces:**
- Consumes: 无（PKG graph dict 形状来自增量2：{nodes:[{id,type,...}],edges:[{type,from,to,...}]}）
- Produces:
  - `compute_fingerprint(repo_path:str)->str`
  - `GraphStore`(ABC): `find_active_version(project_id,repo_path,fingerprint)->int|None`、`load_graph(version_id)->dict`、`store_version(project_id,repo_path,fingerprint,graph)->int`
  - `SqliteGraphStore(db_path:str)` 实现，构造时建表 + 设 WAL。

- [ ] **Step 1: 写 test_fingerprint.py（失败先行）**

```python
import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.pkg.store import compute_fingerprint

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_fingerprint_stable():
    assert compute_fingerprint(FIXTURE) == compute_fingerprint(FIXTURE)


def test_fingerprint_changes_on_edit():
    tmp = tempfile.mkdtemp()
    try:
        dst = os.path.join(tmp, "app.tsx")
        with open(dst, "w") as f:
            f.write("export default function A(){return <div/>;}")
        fp1 = compute_fingerprint(tmp)
        # 改内容并确保 mtime 变化
        import time; time.sleep(0.01)
        with open(dst, "w") as f:
            f.write("export default function A(){return <span/>;}\n// changed")
        fp2 = compute_fingerprint(tmp)
        assert fp1 != fp2
    finally:
        shutil.rmtree(tmp)


def test_fingerprint_excludes_node_modules():
    tmp = tempfile.mkdtemp()
    try:
        with open(os.path.join(tmp, "app.tsx"), "w") as f:
            f.write("export default function A(){return <div/>;}")
        fp_before = compute_fingerprint(tmp)
        nm = os.path.join(tmp, "node_modules"); os.makedirs(nm)
        with open(os.path.join(nm, "junk.ts"), "w") as f:
            f.write("export const x=1;")
        assert compute_fingerprint(tmp) == fp_before  # node_modules 不影响
    finally:
        shutil.rmtree(tmp)
```

> 注意 REPO_ROOT：store.py 在 `ai-runtime/src/evocode_runtime/pkg/`，但**测试文件**在 `ai-runtime/tests/`，故测试里 `parents[2]` = repo 根（与增量2 一致）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_fingerprint.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 store.py**（指纹 + 接口 + SQLite 实现，用尽调验证版）

```python
import os
import json
import hashlib
import sqlite3
from abc import ABC, abstractmethod


def compute_fingerprint(repo_path: str) -> str:
    """SHA-256 of sorted (rel_path, mtime_ns, size) for all .ts/.tsx files,
    excluding node_modules. Stable across calls; changes on any file edit/add/delete."""
    entries = []
    for dirpath, dirnames, filenames in os.walk(repo_path):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fname in filenames:
            if fname.endswith((".ts", ".tsx")):
                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, repo_path)
                st = os.stat(abs_path)
                entries.append((rel_path, st.st_mtime_ns, st.st_size))
    entries.sort()
    payload = json.dumps(entries, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS graph_version (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        TEXT NOT NULL,
    repo_path         TEXT NOT NULL,
    repo_fingerprint  TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now','utc')),
    status            TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_gv_project_repo ON graph_version(project_id, repo_path);
CREATE TABLE IF NOT EXISTS node (
    version_id  INTEGER NOT NULL,
    node_id     TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    data        TEXT    NOT NULL,
    PRIMARY KEY (version_id, node_id),
    FOREIGN KEY (version_id) REFERENCES graph_version(id)
);
CREATE TABLE IF NOT EXISTS edge (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id  INTEGER NOT NULL,
    edge_type   TEXT    NOT NULL,
    from_id     TEXT    NOT NULL,
    to_id       TEXT    NOT NULL,
    data        TEXT,
    FOREIGN KEY (version_id) REFERENCES graph_version(id)
);
CREATE INDEX IF NOT EXISTS idx_edge_version ON edge(version_id);
"""


class GraphStore(ABC):
    @abstractmethod
    def find_active_version(self, project_id: str, repo_path: str, fingerprint: str) -> int | None: ...
    @abstractmethod
    def load_graph(self, version_id: int) -> dict: ...
    @abstractmethod
    def store_version(self, project_id: str, repo_path: str, fingerprint: str, graph: dict) -> int: ...


class SqliteGraphStore(GraphStore):
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def find_active_version(self, project_id: str, repo_path: str, fingerprint: str) -> int | None:
        with self._connect() as conn:
            cur = conn.execute(
                """SELECT id FROM graph_version
                   WHERE project_id=? AND repo_path=? AND repo_fingerprint=? AND status='active'
                   ORDER BY id DESC LIMIT 1""",
                (project_id, repo_path, fingerprint))
            row = cur.fetchone()
            return row[0] if row else None

    def load_graph(self, version_id: int) -> dict:
        with self._connect() as conn:
            nodes = []
            for nid, ntype, djson in conn.execute(
                    "SELECT node_id, type, data FROM node WHERE version_id=?", (version_id,)):
                n = {"id": nid, "type": ntype}
                n.update(json.loads(djson))
                nodes.append(n)
            edges = []
            for etype, fid, tid, djson in conn.execute(
                    "SELECT edge_type, from_id, to_id, data FROM edge WHERE version_id=?", (version_id,)):
                e = {"type": etype, "from": fid, "to": tid}
                if djson:
                    e.update(json.loads(djson))
                edges.append(e)
            return {"nodes": nodes, "edges": edges}

    def store_version(self, project_id: str, repo_path: str, fingerprint: str, graph: dict) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO graph_version(project_id, repo_path, repo_fingerprint, status) VALUES (?,?,?,'active')",
                (project_id, repo_path, fingerprint))
            vid = cur.lastrowid
            for node in graph.get("nodes", []):
                extra = {k: v for k, v in node.items() if k not in ("id", "type")}
                conn.execute(
                    "INSERT INTO node(version_id, node_id, type, data) VALUES (?,?,?,?)",
                    (vid, node["id"], node["type"], json.dumps(extra)))
            for edge in graph.get("edges", []):
                extra = {k: v for k, v in edge.items() if k not in ("type", "from", "to")}
                conn.execute(
                    "INSERT INTO edge(version_id, edge_type, from_id, to_id, data) VALUES (?,?,?,?,?)",
                    (vid, edge["type"], edge["from"], edge["to"], json.dumps(extra) if extra else None))
            conn.execute(
                """UPDATE graph_version SET status='superseded'
                   WHERE project_id=? AND repo_path=? AND id != ? AND status='active'""",
                (project_id, repo_path, vid))
            conn.commit()
            return vid
```

- [ ] **Step 4: 跑指纹测试确认通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_fingerprint.py -v`
Expected: 3 passed。

- [ ] **Step 5: 写 test_store.py**

```python
import os, tempfile, shutil
from evocode_runtime.pkg.store import SqliteGraphStore

GRAPH = {
    "nodes": [
        {"id": "file:/a/page.tsx", "type": "File", "path": "/a/page.tsx"},
        {"id": "comp:/a/page.tsx#Page", "type": "Component", "name": "Page", "filePath": "/a/page.tsx"},
    ],
    "edges": [
        {"type": "IMPORTS", "from": "file:/a/page.tsx", "to": "file:/a/Button.tsx", "specifier": "./Button"},
        {"type": "DEFINES", "from": "file:/a/page.tsx", "to": "comp:/a/page.tsx#Page"},
    ],
}


def _store():
    tmp = tempfile.mkdtemp()
    return SqliteGraphStore(os.path.join(tmp, "data", "pkg.db")), tmp


def test_store_and_load_roundtrip():
    store, tmp = _store()
    try:
        vid = store.store_version("p", "/a", "fp1", GRAPH)
        g = store.load_graph(vid)
        assert len(g["nodes"]) == 2 and len(g["edges"]) == 2
        imp = [e for e in g["edges"] if e["type"] == "IMPORTS"][0]
        assert imp["specifier"] == "./Button"  # 额外字段保真
    finally:
        shutil.rmtree(tmp)


def test_find_active_hit_and_miss():
    store, tmp = _store()
    try:
        vid = store.store_version("p", "/a", "fp1", GRAPH)
        assert store.find_active_version("p", "/a", "fp1") == vid
        assert store.find_active_version("p", "/a", "fpX") is None  # miss
    finally:
        shutil.rmtree(tmp)


def test_new_version_supersedes_old():
    store, tmp = _store()
    try:
        v1 = store.store_version("p", "/a", "fp1", GRAPH)
        v2 = store.store_version("p", "/a", "fp2", GRAPH)
        assert store.find_active_version("p", "/a", "fp1") is None  # 旧被 supersede
        assert store.find_active_version("p", "/a", "fp2") == v2
        assert v2 != v1
    finally:
        shutil.rmtree(tmp)
```

- [ ] **Step 6: 写 pkg/__init__.py 导出**

在现有导出基础上加：
```python
from evocode_runtime.pkg.store import GraphStore, SqliteGraphStore, compute_fingerprint
```
并把它们加入 `__all__`。

- [ ] **Step 7: .gitignore 加 data/**

在根 .gitignore 的 Python 段加：
```
ai-runtime/data/
```

- [ ] **Step 8: 跑 store 测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_store.py -v`
Expected: 3 passed。

- [ ] **Step 9: Commit**

```bash
git add ai-runtime/src/evocode_runtime/pkg/store.py ai-runtime/src/evocode_runtime/pkg/__init__.py ai-runtime/tests/test_store.py ai-runtime/tests/test_fingerprint.py .gitignore
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): SQLite GraphStore with versioning and repo fingerprint"
```

---

### Task 2: understand 缓存感知 + 契约

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py`（ProjectGraphStats +cacheHit/graphVersionId）
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py`（understand 缓存逻辑）
- Modify: `ai-runtime/src/evocode_runtime/pkg/graph.py`（to_context 接受额外 stats 字段）
- Modify: `ai-runtime/src/evocode_runtime/run_service.py`（graphStats 填 cacheHit/versionId）
- Test: `ai-runtime/tests/test_understand_cache.py`
- Modify: `ai-runtime/tests/test_understand.py`（断言 cacheHit 字段存在）

**Interfaces:**
- Consumes: Task 1 的 GraphStore；增量2 的 TsExtractor/ProjectGraph。
- Produces:
  - `models.ProjectGraphStats` 加 `cache_hit: bool = Field(default=False, alias="cacheHit")`、`graph_version_id: int | None = Field(default=None, alias="graphVersionId")`。
  - understand_node 缓存感知；context.stats 含 cacheHit/graphVersionId。

- [ ] **Step 1: models.py 加字段**

ProjectGraphStats 增加：
```python
    cache_hit: bool = Field(default=False, alias="cacheHit")
    graph_version_id: int | None = Field(default=None, alias="graphVersionId")
```
（保留 file_count/component_count/import_count；确保 model_config populate_by_name=True 已在）

- [ ] **Step 2: pkg/graph.py — to_context 支持注入额外 stats**

把 `to_context` 改为接受可选额外 stats：
```python
    def to_context(self, project_id: str, extra_stats: dict | None = None) -> dict:
        stats = self.stats()
        if extra_stats:
            stats.update(extra_stats)
        return {"projectId": project_id, "graph": {"nodes": self._nodes, "edges": self._edges}, "stats": stats}
```

- [ ] **Step 3: 写 test_understand_cache.py（失败先行）**

```python
import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.graph.nodes import understand_node

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

import shutil as _sh
import pytest
requires_node = pytest.mark.skipif(
    not (_sh.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


@requires_node
def test_cache_miss_then_hit(monkeypatch, tmp_path):
    # 隔离 DB 到临时路径
    db = str(tmp_path / "data" / "pkg.db")
    monkeypatch.setenv("EVOCODE_PKG_DB", db)
    base = {"intent": "x", "projectId": "demo", "repoPath": FIXTURE,
            "context": {}, "phase": "", "tasks": []}
    out1 = understand_node(dict(base))
    assert out1["context"]["stats"]["cacheHit"] is False
    assert out1["context"]["stats"]["graphVersionId"] is not None
    assert out1["context"]["stats"]["fileCount"] >= 4
    out2 = understand_node(dict(base))
    assert out2["context"]["stats"]["cacheHit"] is True  # 第二次命中
    assert out2["context"]["stats"]["graphVersionId"] == out1["context"]["stats"]["graphVersionId"]
    assert out2["context"]["stats"]["fileCount"] >= 4  # 读库重建保真


def test_no_repo_no_cache():
    out = understand_node({"intent": "x", "projectId": "demo", "repoPath": "",
                           "context": {}, "phase": "", "tasks": []})
    assert out["context"]["stats"]["cacheHit"] is False
    assert out["context"]["stats"]["fileCount"] == 0
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_understand_cache.py -v`
Expected: FAIL。

- [ ] **Step 5: graph/nodes.py — understand 缓存感知**

```python
import os
from evocode_runtime.graph.state import RunState
from evocode_runtime.llm import get_llm_gateway
from evocode_runtime.pkg import TsExtractor, ProjectGraph, ExtractionError
from evocode_runtime.pkg import SqliteGraphStore, compute_fingerprint

_PLACEHOLDER_STATS = {"fileCount": 0, "componentCount": 0, "importCount": 0,
                      "cacheHit": False, "graphVersionId": None}


def _db_path() -> str:
    return os.environ.get(
        "EVOCODE_PKG_DB",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "pkg.db"))


def _placeholder(project_id: str) -> dict:
    return {"context": {"projectId": project_id,
                        "graph": {"nodes": [], "edges": []},
                        "stats": dict(_PLACEHOLDER_STATS)},
            "phase": "understood"}


def understand_node(state: RunState) -> dict:
    repo_path = state.get("repoPath") or ""
    project_id = state["projectId"]
    if not (repo_path and os.path.isdir(repo_path)):
        return _placeholder(project_id)
    extractor = TsExtractor()
    if not extractor.is_available():
        return _placeholder(project_id)
    try:
        fp = compute_fingerprint(repo_path)
        store = None
        try:
            store = SqliteGraphStore(_db_path())
            vid = store.find_active_version(project_id, repo_path, fp)
        except Exception:  # noqa: BLE001  DB 不可用 → 退化为不缓存
            store, vid = None, None
        if store is not None and vid is not None:
            graph = store.load_graph(vid)
            pg = ProjectGraph(graph["nodes"], graph["edges"])
            return {"context": pg.to_context(project_id, {"cacheHit": True, "graphVersionId": vid}),
                    "phase": "understood"}
        # miss：抽取
        raw = extractor.extract(repo_path)
        new_vid = None
        if store is not None:
            try:
                new_vid = store.store_version(project_id, repo_path, fp, raw)
            except Exception:  # noqa: BLE001  存失败不影响本次结果
                new_vid = None
        pg = ProjectGraph(raw["nodes"], raw["edges"])
        return {"context": pg.to_context(project_id, {"cacheHit": False, "graphVersionId": new_vid}),
                "phase": "understood"}
    except ExtractionError:
        return _placeholder(project_id)
    except Exception:  # noqa: BLE001  任何意外 → 占位，绝不让 /runs 失败
        return _placeholder(project_id)
```

（plan_node 不变）

- [ ] **Step 6: run_service.py — graphStats 填新字段**

把构造 ProjectGraphStats 处改为读 stats 的全部字段：
```python
            stats = (final.get("context") or {}).get("stats") or {}
            gs = ProjectGraphStats(
                fileCount=stats.get("fileCount", 0),
                componentCount=stats.get("componentCount", 0),
                importCount=stats.get("importCount", 0),
                cacheHit=stats.get("cacheHit", False),
                graphVersionId=stats.get("graphVersionId"))
```

- [ ] **Step 7: test_understand.py 加 cacheHit 字段断言**

在现有 placeholder 测试里追加：
```python
    assert out["context"]["stats"]["cacheHit"] is False
```

- [ ] **Step 8: 跑全部 Python 测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -v`
Expected: 全绿（增量1/2 的 27 + fingerprint 3 + store 3 + understand_cache 2）。注意 test_understand_cache 的 DB 用 tmp_path 隔离，不污染真实 data/。

- [ ] **Step 9: Commit**

```bash
git add ai-runtime/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): cache-aware understand node backed by GraphStore"
```

---

### Task 3: 契约镜像（Java + 前端 + schema）

**Files:**
- Modify: `contracts/intent.schema.json`（ProjectGraphStats +cacheHit/graphVersionId）
- Modify: `control-plane/.../dto/ProjectGraphStats.java`
- Modify: `frontend/src/types/intent.ts`
- Modify: `frontend/src/app/page.tsx`（展示 cacheHit）

**Interfaces:**
- Consumes: 升级后的 ProjectGraphStats。
- Produces: 四处镜像一致；前端展示缓存命中。

- [ ] **Step 1: contracts/intent.schema.json**

ProjectGraphStats properties 加：
```json
"cacheHit": { "type": "boolean" },
"graphVersionId": { "type": ["integer", "null"] }
```
required 仍只含 fileCount/componentCount/importCount（cacheHit/graphVersionId 可选，向后兼容）。验证 JSON 解析：`python -c "import json;json.load(open('contracts/intent.schema.json'))"`。

- [ ] **Step 2: ProjectGraphStats.java**

```java
package com.evocode.controlplane.dto;

public record ProjectGraphStats(
    int fileCount,
    int componentCount,
    int importCount,
    Boolean cacheHit,
    Integer graphVersionId
) {}
```
（用包装类型 Boolean/Integer 以容忍 null/缺省）

- [ ] **Step 3: 编译 + 测试**

Run: `cd control-plane && mvn -q compile && mvn -q test`
Expected: BUILD SUCCESS。

- [ ] **Step 4: frontend types/intent.ts**

ProjectGraphStats 接口加：
```typescript
  cacheHit?: boolean;
  graphVersionId?: number | null;
```

- [ ] **Step 5: frontend page.tsx 展示 cacheHit**

在 graphStats 渲染行追加缓存标记：
```tsx
{result?.graphStats && (
  <p>项目图：{result.graphStats.fileCount} 文件 / {result.graphStats.componentCount} 组件 / {result.graphStats.importCount} import
    {result.graphStats.cacheHit ? "（缓存命中）" : "（新抽取）"}
    {result.graphStats.graphVersionId != null ? ` v${result.graphStats.graphVersionId}` : ""}
  </p>
)}
```

- [ ] **Step 6: 前端构建**

Run: `cd frontend && pnpm build`
Expected: 成功，无类型错误。

- [ ] **Step 7: Commit**

```bash
git add contracts/ control-plane/ frontend/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat: propagate cacheHit/graphVersionId across contract, gateway, frontend"
```

---

### Task 4: 端到端联调

**Files:**
- Modify: `README.md`（补缓存命中 e2e 示例）

**Interfaces:**
- Consumes: Task 1-3 全部。
- Produces: 文档化的持久化缓存端到端证据。

- [ ] **Step 1: 启动 Python + Java**（主会话管控，后台）

注意：确保 ai-runtime/data/ 是干净的（或接受已有 DB）；e2e 用真实 data/pkg.db。

- [ ] **Step 2: 第一次请求（cache miss）**

Run:
```bash
curl -s -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"E:/evocode/test/fixtures/next-app"}'
```
Expected: graphStats.cacheHit=false，graphVersionId 非空，fileCount=4。

- [ ] **Step 3: 第二次同请求（cache hit）**

同一命令再发一次。
Expected: graphStats.cacheHit=true，graphVersionId 与第一次相同，fileCount=4。

- [ ] **Step 4: 停服务，README 补缓存 e2e，清理 e2e 产生的 data/pkg.db（不提交），Commit**

```bash
rm -f ai-runtime/data/pkg.db ai-runtime/data/pkg.db-wal ai-runtime/data/pkg.db-shm
git add README.md
git -c user.name="evocode" -c user.email="evocode@local" commit -m "docs: increment 3 verified e2e — persistent graph cache hit"
```

---

## Self-Review

**Spec coverage:** §4 GraphStore→T1；§3 understand 缓存→T2；§5 契约→T2(Pydantic)+T3(schema/Java/TS)；§6 测试→T1(fingerprint/store)+T2(understand_cache)；§7 回退(store失败退化/占位)→T2(nodes 多层 try)。✓
**Placeholder scan:** schema/指纹/SQL/版本化用 graph-store-notes.md 验证版逐字；各步含完整代码/命令。✓
**Type consistency:** cacheHit(bool)/graphVersionId(int|null) 四处镜像：schema、Pydantic(alias)、Java(Boolean/Integer)、TS(可选)。✓
**回归保护:** 增量1/2 的 27 测试 Step8 全跑；understand_cache 用 tmp_path+EVOCODE_PKG_DB 隔离 DB 不污染。✓
**安全/卫生:** data/ 进 .gitignore(T1S7)；e2e 后删 DB(T4S4) 绝不提交。store 失败退化不让 /runs 500。✓
**DB 路径:** _db_path 默认 ai-runtime/data/pkg.db（相对 nodes.py 上溯），可被 EVOCODE_PKG_DB 覆盖（测试隔离用）。✓
