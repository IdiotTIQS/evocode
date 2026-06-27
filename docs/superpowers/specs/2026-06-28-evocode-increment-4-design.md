# EvoCode 增量 4 — 图分析：影响/依赖分析驱动规划 设计文档

> 状态：自主推进（loop/goal 模式），AI 自主决策
> 日期：2026-06-28
> 前置：增量 3 已合并（PKG 持久化 + 缓存）

## 1. 背景

增量 2/3 让 understand 产出真实 PKG，但 Planner 仅用 `stats`（组件总数）。增量 4 把 round 2 设计的**影响分析 / 依赖分析**落到 ProjectGraph 上，让 Planner 从"看组件清单"进到"看依赖影响面"——这是规划从计数走向结构推理的关键一步，也呼应 round 2 PKG 设计的核心查询能力。

零外部依赖（纯 Python 图遍历）、确定性可测，符合一贯的"无凭证可端到端验证"原则。

## 2. 范围与边界

### 目标

- ProjectGraph 增加图分析查询（基于 IMPORTS/DEFINES 边）：
  - `dependencies_of(file_id, max_depth)` — 该文件（传递）依赖谁（沿 IMPORTS 正向）
  - `impact_of(file_id, max_depth)` — 改该文件会（传递）波及谁（沿 IMPORTS 反向）
  - `components_in(file_id)` — 文件定义的组件（DEFINES）
  - `find_file_by_suffix(suffix)` — 按路径后缀定位文件节点（供意图引用具体文件）
- 方向语义统一：边 `from → to` 读作 "from 依赖 to"（IMPORTS：导入方 from → 被导入 to）。依赖=正向可达，影响=反向可达。
- Planner 增强（StubLlmProvider）：当意图提及已存在的文件/组件时，用 impact_of 给出受影响文件数，并把"影响面"写进任务描述（确定性）。
- understand 把一个轻量"分析摘要"放进 context.stats：如 `maxImpactFile`（影响面最大的文件）+ `maxImpactCount`，供观测与规划。
- 契约：ProjectGraphStats 增加可选 `maxImpactCount`（int）—— 反映图的耦合度信号。

### 明确不做（YAGNI）

- 不做语义检索/embedding/pgvector。
- 不做环检测/分层校验（round2 的 detectCycles/checkLayering 留后续）。
- 不做跨文件符号级（component→component）影响——只到文件级 IMPORTS 传递闭包（组件经 DEFINES 归属文件）。
- 不改 GraphStore（分析在内存 ProjectGraph 上跑，数据来源仍是缓存/抽取）。
- 不做 Java/前端的图分析展示扩展——只透传 maxImpactCount。

## 3. 算法（纯 Python，确定性）

```
邻接构建（一次）:
  out_adj[from] += to   (仅 IMPORTS 边)   # from 依赖 to
  in_adj[to]   += from  (仅 IMPORTS 边)   # to 被 from 依赖

dependencies_of(fid, max_depth): BFS over out_adj from fid, 去重, 限深
impact_of(fid, max_depth):       BFS over in_adj from fid, 去重, 限深
```
BFS 用 deque，visited 集合去重，max_depth 默认 None（无限，但图小）。结果按 node_id 排序保证确定性。

## 4. ProjectGraph 新增 API

```python
def dependencies_of(self, file_id: str, max_depth: int | None = None) -> list[str]: ...
def impact_of(self, file_id: str, max_depth: int | None = None) -> list[str]: ...
def components_in(self, file_id: str) -> list[dict]: ...
def find_file_by_suffix(self, suffix: str) -> str | None: ...  # 返回首个匹配 file_id
def analysis_summary(self) -> dict: ...  # {maxImpactFile, maxImpactCount}
```
邻接表在 __init__ 预构建（缓存于实例）。现有 files/components/imports_of/stats/to_context 不变。

## 5. understand + 契约

understand_node 在构建 context 时调用 `pg.analysis_summary()`，把 `maxImpactCount` 合并进 stats（占位回退时为 0）。

`ProjectGraphStats` 增加可选 `max_impact_count: int = Field(default=0, alias="maxImpactCount")`。四处镜像。

StubLlmProvider.plan：若 context.stats.maxImpactCount > 0，frontend/backend 任务描述追加"（项目最大影响面 N 文件）"，保持确定性。

## 6. 测试策略

- **pytest**：
  - dependencies_of / impact_of：用固定 nodes/edges（A imports B imports C），断言 A 依赖 {B,C}、C 影响 {A,B}，限深生效
  - components_in / find_file_by_suffix：固定图断言
  - analysis_summary：断言 maxImpactFile/Count 正确
  - understand：带 fixture，断言 stats 含 maxImpactCount（fixture: page imports Button+Card → Button 被 page 依赖，impact_of(Button)={page}）
  - 增量1/2/3 的 36 测试继续通过
- **端到端**：带 repoPath 请求，断言 graphStats.maxImpactCount 反映 fixture 真实耦合（page 导入 2 个 → 这俩文件 impact=1；page 自身 impact=0；maxImpactCount=1）。

## 7. 风险

- **方向语义混淆**：依赖 vs 影响方向必须测试钉死（A→B 表示 A 依赖 B；改 B 影响 A）。fixture 断言覆盖。
- **环/自引用**：visited 去重防无限循环（即使图有环）。
- **确定性**：BFS 结果排序，避免 set 迭代顺序导致非确定。
- **回退**：分析在已构建的 ProjectGraph 上跑，不引入新失败源；占位图分析摘要为 0。
