# EvoCode 增量 0 — 四层骨架与健康契约 设计文档

> 状态：已批准方向，待用户审阅本 spec
> 日期：2026-06-28
> 模式：增量实现（Incremental Implementation Mode）

## 1. 背景与不可变约束

EvoCode（IntentOS）是 Agent 驱动的软件工程平台。开发者用自然语言表达意图，自治 Agent 持续规划、实现、测试、评审、演化目标应用。

深层本体（来自既有设计，保持不变）：
- 软件是持续演化的知识图谱。
- Agent 修改的是**系统**（经 `GraphMutation` 逻辑变更 IR），而非直接改文件。
- **图提出假设，验证做裁定**：任何变更不通过 build/lint/test 就不会从 `hypothetical` 转为 `confirmed`。

**FINAL 运行时架构（不可修改）：**

```
前端 (React/Next.js)
  → Spring Boot 控制平面 (网关 / 企业层)
    → Python AI 运行时 (LangGraph Agent 系统)
      → 业务服务层 (验证引擎 / 图存储 / 沙箱 / 目标仓库 I/O)
```

既有子系统设计各归其位：
- 多 Agent 运行时 + PKG → Python AI 运行时
- 验证引擎、图存储 (Postgres+pgvector)、沙箱 → 业务服务层
- RunRuntime facade + 企业能力（鉴权/RBAC/编排 API/持久化）→ Spring Boot 控制平面
- Web 控制台 → 前端

## 2. 本增量目标与边界

### 目标

搭建容纳四层的多语言 monorepo 骨架，并打通一条贯穿四层的**健康契约**：

```
前端 → POST /api/intents (Java 网关) → POST /runs (Python 运行时) → 返回桩化 run 确认
```

外加 `GET /actuator/health`（Java）与 `GET /health`（Python）。

### 验收标准（“完成”的定义）

1. `control-plane/` 能 `mvn compile` 通过，`mvn spring-boot:run` 可启动。
2. `ai-runtime/` 能在 venv 中安装依赖并 `uvicorn` 启动，`GET /health` 返回 200。
3. `frontend/` 能 `pnpm install` 且 `pnpm build` 通过。
4. 手工端到端验证：启动 Python + Java 两层，`curl POST /api/intents` 经 Java 转发到 Python，返回桩化 `{runId, status:"accepted"}`。
5. `git init` 完成并首次提交。

### 明确不做（YAGNI）

- 不实现任何 Agent 逻辑、PKG、真实 LLM 调用。
- 不接入真实 Postgres / Redis / Docker 沙箱。
- 业务服务层增量 0 **不实现**，仅在 Python 运行时之后留好接缝（stub 注释）。
- 前端只做一个能调网关并渲染响应的页面，无完整控制台 UI。
- 不加鉴权（见安全说明）。

### 安全说明

增量 0 的连线在网关和 Python 运行时上**无鉴权**，仅适用本地骨架。Spring Boot 是“企业/鉴权”层，任何非本地暴露前必须先落地真实鉴权。后续增量补 auth/RBAC。

## 3. 仓库布局（方案 A：多语言原生）

```
evocode/
├─ README.md
├─ .gitignore
├─ contracts/                      # 跨层共同事实来源
│  ├─ README.md
│  └─ intent.schema.json           # 意图请求/响应 JSON Schema
├─ frontend/                       # Next.js 控制台 (React)
│  ├─ package.json
│  ├─ next.config.mjs
│  ├─ tsconfig.json
│  ├─ .env.example                 # NEXT_PUBLIC_CONTROL_PLANE_URL
│  └─ src/
│     ├─ app/{layout.tsx,page.tsx} # 调网关的最小页面
│     ├─ lib/api.ts                # 控制平面 API 客户端
│     └─ types/intent.ts           # 镜像 contracts 的 TS 类型
├─ control-plane/                  # Spring Boot 网关 (Maven, JDK 21)
│  ├─ pom.xml
│  └─ src/main/
│     ├─ java/com/evocode/controlplane/
│     │  ├─ ControlPlaneApplication.java
│     │  ├─ api/IntentController.java        # POST /api/intents
│     │  ├─ client/PythonRuntimeClient.java  # 转发到 Python 运行时
│     │  └─ dto/{IntentRequest.java,RunAcknowledgement.java}
│     └─ resources/application.yml           # 端口 + python.runtime.base-url
├─ ai-runtime/                     # Python LangGraph 运行时 (FastAPI, 3.11)
│  ├─ pyproject.toml
│  ├─ .env.example
│  └─ src/evocode_runtime/
│     ├─ __init__.py
│     ├─ main.py                    # FastAPI: POST /runs, GET /health
│     ├─ models.py                  # Pydantic：镜像 contracts
│     └─ services/__init__.py       # 业务服务层接缝 (stub 注释)
└─ services/
   └─ README.md                    # 业务服务层占位说明
```

依赖方向：`frontend → control-plane → ai-runtime → services`，单向向下。各层用各自语言原生工具链，互不干扰（不强行 monorepo 工具统一）。

## 4. 跨层契约

唯一事实来源放 `contracts/intent.schema.json`，三处镜像：
- 前端：`frontend/src/types/intent.ts`（TS 接口）
- 网关：`control-plane/.../dto/*.java`（Java DTO）
- 运行时：`ai-runtime/.../models.py`（Pydantic 模型）

### IntentRequest

| 字段 | 类型 | 说明 |
|------|------|------|
| `intent` | string | 用户自然语言意图 |
| `projectId` | string | 目标项目标识 |

### RunAcknowledgement

| 字段 | 类型 | 说明 |
|------|------|------|
| `runId` | string (uuid) | 本次演化事务 id |
| `status` | enum: `accepted` \| `rejected` | 桩阶段恒为 `accepted` |
| `message` | string | 人类可读说明 |

注：`runId` 对应既有设计中 `Transaction`/`RunState` 的 id，本增量仅生成不驱动。

## 5. 各层职责（增量 0 范围）

- **前端**：一个页面，表单输入 intent + projectId，调 `POST {CONTROL_PLANE_URL}/api/intents`，渲染返回的 `RunAcknowledgement`。地址走 `NEXT_PUBLIC_CONTROL_PLANE_URL`。
- **控制平面 (Java)**：`IntentController` 暴露 `POST /api/intents`，校验 DTO，经 `PythonRuntimeClient`（用 `RestClient`）转发到 Python 的 `POST /runs`，回传结果。`GET /actuator/health` 由 Spring Actuator 提供。`python.runtime.base-url` 走配置。
- **AI 运行时 (Python)**：FastAPI 暴露 `POST /runs`（接 `IntentRequest`，生成 `runId=uuid4`，返回 `RunAcknowledgement(status=accepted)`）与 `GET /health`。`services/` 包仅留接缝注释，标明真正的 LangGraph 图 + PKG + 验证引擎后续插入此处。
- **业务服务层**：本增量不实现，`services/README.md` 说明后续承载验证引擎/图存储/沙箱。

## 6. 跨层影响

| 层 | 改动 | 依赖/配置 |
|----|------|-----------|
| 前端 | 新增 API 客户端 + 一个页面 + TS 类型 | `NEXT_PUBLIC_CONTROL_PLANE_URL` |
| 控制平面 | 新增 controller/client/dto + actuator | `python.runtime.base-url` |
| AI 运行时 | 新增 FastAPI app + Pydantic 模型 | 端口 8000 |
| 业务服务 | 仅占位 README | — |
| 契约 | 新增 JSON Schema，三处镜像 | — |

## 7. 测试策略（增量 0）

骨架阶段以“可构建 + 可启动 + 一条端到端 curl”为主要验证。仍配好各层测试运行器，便于后续增量第一条测试直接跑：
- Python：pytest（配 `pyproject.toml`，加一条 `/health` 的冒烟测试）。
- Java：JUnit（Spring Boot starter-test 自带，加一条 context-loads 测试）。
- 前端：本增量不强制单测，留 `next build` 作为类型/构建验证。

## 8. 风险

- **多层手工联调成本**：四层各自启动，本增量靠文档化的启动顺序（Python → Java → 前端）与 curl 验证，未做 docker-compose（Docker 缺失）。后续增量补编排。
- **pip/python 版本错配**：环境中 `pip` 绑在 3.13，须用 `python -m venv` 隔离到 3.11。计划中显式用 venv。
- **无鉴权**：见 §2 安全说明，仅本地。
