# EvoCode 增量 1 — 真实 LangGraph 编排驱动 /runs（Planner 流水线）设计文档

> 状态：自主推进（loop 模式），AI 自主决策范围
> 日期：2026-06-28
> 前置：增量 0 已合并（四层骨架 + 健康契约）

## 1. 背景

增量 0 证明四层物理连通，`/runs` 返回桩化确认。增量 1 让 Python AI 运行时从"桩"变"真"：`/runs` 调用一个**真实的 LangGraph StateGraph**，跑 Understand→Plan 流水线，返回真实的 `TaskGraph`。

保持四层 FINAL 架构不变；本增量只深化 Python AI 运行时层（services 接缝的第一块真实实现）。

## 2. 范围与边界

### 目标

- 引入 LangGraph，在 `ai-runtime` 内建一个 StateGraph：`understand → plan`。
- `POST /runs` 执行该图，返回真实 `RunResult{runId, status, taskGraph, phase}`，其中 `taskGraph` 是 Planner 产出的工程任务列表。
- **可插拔 LLM 网关**：`LlmGateway` 接口 + 两个 provider：
  - `StubLlmProvider`（默认）：确定性、无需凭证、基于规则把意图拆成任务。让整条 agent 流水线无外部依赖即可端到端测试。
  - `OpenAiLlmProvider`：OpenAI 兼容，从环境变量读 base-url/key/model；无 key 时不激活。
- LangGraph 内存检查点（`MemorySaver`），为后续可恢复性铺路。
- 契约升级：`RunAcknowledgement` → `RunResult`（增加 `taskGraph`、`phase` 字段）。三层镜像同步（TS/Java/Pydantic）。

### 明确不做（YAGNI）

- 不做 PKG（项目知识图谱）——Understand 阶段本增量产出**占位 context**（仅回显 projectId + 空结构），真实图抽取留待后续增量。
- 不做 Frontend/Backend/Review/Test Agent——只做 Planner。
- 不做真实文件改动、验证引擎、GraphMutation 物化。
- 不做 Postgres/Redis 检查点——用内存 MemorySaver。
- Java 网关不解析 taskGraph 内容，原样透传给前端。

## 3. 契约升级

`contracts/intent.schema.json` 增加 `EngineeringTask`、`TaskGraph`、`RunResult`：

### EngineeringTask
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 任务标识，如 "task-1" |
| `title` | string | 任务标题 |
| `kind` | enum: `frontend`\|`backend`\|`test`\|`generic` | 任务类型 |
| `description` | string | 任务描述 |

### TaskGraph
| 字段 | 类型 | 说明 |
|------|------|------|
| `tasks` | EngineeringTask[] | 有序工程任务 |

### RunResult（替代 RunAcknowledgement）
| 字段 | 类型 | 说明 |
|------|------|------|
| `runId` | string (uuid) | 演化事务 id |
| `status` | enum: `completed`\|`failed` | 流水线执行结果 |
| `phase` | string | 终态阶段（`planning` 完成即 `planned`） |
| `taskGraph` | TaskGraph | Planner 产出 |
| `message` | string | 人类可读说明 |

向后兼容：增量 0 的 `RunAcknowledgement{runId,status,message}` 被 `RunResult` 取代；三层镜像同步更新，前端渲染 taskGraph。

## 4. 架构（ai-runtime 内部）

```
POST /runs
  → RunService.execute(IntentRequest)
      → build StateGraph (understand → plan), compiled with MemorySaver
      → invoke with initial RunState{intent, projectId}
          ├─ understand_node: 产出占位 context（回显 projectId, 空 graph 结构）
          └─ plan_node: 调 LlmGateway.plan(intent, context) → TaskGraph
      → 返回 RunResult
```

### 模块结构（ai-runtime/src/evocode_runtime/）
```
llm/
  __init__.py
  gateway.py        # LlmGateway 抽象基类 + PlanRequest/PlanResponse
  stub_provider.py  # StubLlmProvider：确定性规则拆解
  openai_provider.py# OpenAiLlmProvider：OpenAI 兼容（无 key 不激活）
  factory.py        # 按环境变量选 provider，默认 stub
graph/
  __init__.py
  state.py          # RunState (TypedDict)：intent/projectId/context/taskGraph/phase
  nodes.py          # understand_node, plan_node
  builder.py        # build_graph() → 编译好的 StateGraph
agents/
  __init__.py
  planner.py        # PlannerAgent：封装 plan_node 逻辑，调 LlmGateway
run_service.py      # RunService：编排图执行，返回 RunResult
models.py           # 升级：EngineeringTask/TaskGraph/RunResult
```

services/__init__.py 接缝注释更新：Planner 已实现，PKG/验证/其他 agent 仍为后续。

### StubLlmProvider 规则（确定性，可测）
按意图关键词产出任务：
- 含 "page"/"页面"/"ui"/"component" → 增 frontend 任务
- 含 "api"/"endpoint"/"接口"/"service" → 增 backend 任务
- 总是追加一个 test 任务
- 都不匹配 → 一个 generic 任务
保证相同输入产出相同 TaskGraph，便于断言。

## 5. 跨层影响

| 层 | 改动 |
|----|------|
| ai-runtime | 新增 llm/graph/agents 模块 + RunService；models 升级；pyproject 加 langgraph==1.2.6；/runs 改调 RunService |
| control-plane | RunAcknowledgement → RunResult record（加 taskGraph/phase）；client/controller 透传 |
| frontend | RunAcknowledgement → RunResult 类型；page 渲染 taskGraph 列表 |
| contracts | schema 增 EngineeringTask/TaskGraph/RunResult |
| services | 仅注释更新 |

## 6. 测试策略

- **Python（pytest）**：
  - StubLlmProvider 规则单测（page→frontend任务、api→backend任务、总有test任务、generic 回退）
  - graph builder 单测：invoke 图，断言 taskGraph 非空、phase 正确
  - RunService 单测：execute 返回 RunResult，status=completed
  - /runs 端点测试：POST 真实意图，断言响应含 taskGraph
- **Java（JUnit）**：contextLoads 仍通过（DTO 升级后编译+装配）
- **前端**：next build 通过（类型对齐新契约）
- **端到端**：curl POST /api/intents，断言返回真实 taskGraph（不再是空确认）

## 7. 风险

- **LangGraph API 版本漂移**：1.2.6 的 StateGraph/MemorySaver API。缓解：实现者按已装版本的实际 API 写，测试驱动。
- **契约破坏性变更**：RunAcknowledgement→RunResult 是 breaking change。缓解：三层同步在同一增量内完成，端到端测试兜底。
- **StubProvider 决定论**：避免随机/时间依赖，保证测试稳定。
