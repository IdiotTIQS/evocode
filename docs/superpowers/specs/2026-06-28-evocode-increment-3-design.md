# EvoCode 增量 3 — 持久化图存储（SQLite 后端 + GraphStore 接口）设计文档

> 状态：自主推进（loop/goal 模式），AI 自主决策
> 日期：2026-06-28
> 前置：增量 2 已合并（understand 接真实 PKG，每次全量抽取丢弃）

## 1. 背景与务实约束

增量 2 的 PKG 每次 /runs 全量抽取后丢弃。增量 3 让图**持久化、版本化、可缓存命中**——这是迈向"软件是持续演化的知识图谱"本体的第一步：图跨 run 存活。

**环境约束（已尽调确认）**：本机无 Postgres、无 Docker，但 Python 内置 sqlite3 3.50.4 可用。设计终态是 Postgres+pgvector，当前用 **SQLite 作后端**，但**置于 `GraphStore` 接口之后**——Postgres 实现是未来接口背后的局部替换（呼应 round 2"读写分离 port 即微服务切割线"）。这不是妥协设计，而是把"持久化图存储"这个真实能力先落地，后端可换。

## 2. 范围与边界

### 目标

- 新增 `GraphStore` 接口 + `SqliteGraphStore` 实现：持久化 PKG 到 SQLite，版本化（graph_version/node/edge 表），never-delete（status active/superseded）。
- 仓库变更检测：`compute_fingerprint(repo_path)`（Option A：.ts/.tsx 的 (relpath,mtime_ns,size) SHA-256，排除 node_modules）。
- understand 节点升级为**缓存感知**：
  - 算指纹 → 查 active 版本 → 命中则**读库重建图**（跳过抽取）；未命中则抽取 + 写新版本 + supersede 旧版本。
  - 新增可观测信号：context.stats 加 `cacheHit: bool` 与 `versionId`。
- 契约：RunResult.graphStats 加可选 `cacheHit`、`graphVersionId`。
- SQLite WAL + synchronous=NORMAL；DB 路径可配（默认 ai-runtime 下 data/pkg.db，gitignore）。

### 明确不做（YAGNI）

- 不做 Postgres/pgvector——SQLite 后端，但接口预留。
- 不做语义检索/embedding。
- 不做**增量子图更新**——repo 变了就整版重抽重存（全量版本化，不做 diff/对账）。
- 不做跨 projectId 的图合并、不做图查询 API 扩展（沿用增量 2 的 ProjectGraph 内存查询，只是数据来源可能是库）。
- repoPath 仍无沙箱（增量 2 遗留债务，多租户前再处理；记录不在本增量解决）。

## 3. 架构

```
understand_node(state):
  repo_path 有效 & 抽取器可用?
    ├─ fp = compute_fingerprint(repo_path)
    ├─ store = SqliteGraphStore(db_path)
    ├─ vid = store.find_active_version(projectId, repo_path, fp)
    ├─ 命中(vid): graph = store.load_graph(vid); cacheHit=True
    └─ 未命中: raw = TsExtractor.extract(repo_path)
               vid = store.store_version(projectId, repo_path, fp, raw)  # supersede 旧
               graph = raw; cacheHit=False
    → ProjectGraph(graph) → context{..., stats{...,cacheHit,versionId}}
  否则 → 占位 context（增量1/2 回退行为，cacheHit=False, versionId=None）
```

### 新增/变更结构
```
ai-runtime/src/evocode_runtime/pkg/
  store.py          # 新增：GraphStore(抽象) + SqliteGraphStore + compute_fingerprint
  __init__.py       # 导出 GraphStore/SqliteGraphStore/compute_fingerprint
  graph/nodes.py    # understand 升级为缓存感知
  models.py         # ProjectGraphStats 加 cacheHit/graphVersionId(可选)
ai-runtime/data/    # SQLite DB 落地处, gitignore
```

## 4. GraphStore 接口

```python
class GraphStore(ABC):
    @abstractmethod
    def find_active_version(self, project_id: str, repo_path: str, fingerprint: str) -> int | None: ...
    @abstractmethod
    def load_graph(self, version_id: int) -> dict: ...  # {nodes, edges}
    @abstractmethod
    def store_version(self, project_id: str, repo_path: str, fingerprint: str, graph: dict) -> int: ...
```
`SqliteGraphStore(db_path)` 实现之；schema/SQL/版本化用尽调验证版（graph-store-notes.md）。

## 5. 契约升级

`ProjectGraphStats` 增加可选字段：
- `cacheHit: bool`（图是否来自缓存命中）
- `graphVersionId: int | null`（版本 id，便于追溯）

四处镜像（Pydantic alias / Java record / TS）。占位回退时 cacheHit=false, graphVersionId=null。RunResult.graphStats 已是可选，结构内加这两字段。

## 6. 测试策略

- **pytest**：
  - compute_fingerprint：稳定性（两次一致）、敏感性（改文件即变）、排除 node_modules
  - SqliteGraphStore：store→load round-trip 保真；find_active 命中/未命中；store 新版本 supersede 旧版本
  - understand 缓存：首次 miss(抽取+存)、二次 hit(读库不抽取)——用 fixture + 临时 DB；断言 cacheHit 翻转
  - 回退：无 repoPath → 占位，cacheHit=False
  - 增量 1/2 所有测试继续通过（27 个）
- **端到端**：同一 repoPath 连发两次，第二次 graphStats.cacheHit=true、versionId 稳定。

## 7. 风险

- **SQLite 文件并发**：单 FastAPI 进程低并发，WAL+NORMAL 足够；run_service 的 _graph 单例 + store 每次新建连接，避免跨线程连接复用问题（每次 understand 开/关连接）。
- **指纹 mtime 依赖**：git checkout 重置 mtime 会误判变更（尽调记录）——dev 工作仓库 mtime 可靠，接受。
- **DB 路径/gitignore**：data/ 必须 gitignore，绝不提交 DB。
- **回退保护**：store 失败（如 DB 锁）不能让 /runs 失败——store 异常时退化为"抽取但不缓存"，再不行才占位。
