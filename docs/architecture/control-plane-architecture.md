# Control Plane Architecture

> **实现状态（截至 increment 6） / Implementation Status (as of increment 6)**
> 本文档描述的是**目标架构**。当前 Control Plane 是一个轻量转发层：**无鉴权、仅 localhost**。
> - ✅ 已构建：`POST /api/intents` 转发到 AI Runtime `POST /runs`（IntentController + PythonRuntimeClient）；CORS 配置（WebCorsConfig）；四层 DTO 契约镜像（含 ReviewOutput/ReviewFinding）；`/actuator/health`。
> - 📋 计划中（pom.xml 无对应依赖、代码无对应包）：Spring Security / JWT 鉴权授权（无 `security/` 包）；Spring Data JPA / PostgreSQL（无 `domain/`、`service/`）；Spring WebFlux / SSE 流式；Redis 会话与运行队列；多租户边界；Run/Task 状态持久化；项目与运行管理端点（`/api/projects`、`/api/runs/*` 等）。
>
> 下文中的领域模型、完整 API 表、编排流程描述的是目标设计，目前仅 `POST /api/intents` 与健康检查端点真实存在。

## Overview

The Control Plane is the coordination hub of the EvoCode platform. It is a Spring Boot application that sits between the developer-facing Frontend and the agent-executing AI Runtime. All requests enter through the Control Plane. All state is owned by the Control Plane.

---

## Technology Stack

| Concern | Choice |
|---|---|
| Framework | Spring Boot 3 |
| Language | Java 21 |
| Build | Maven |
| Database | PostgreSQL (JPA / Spring Data) — 📋 planned |
| Cache | Redis (session state, run queues) — 📋 planned |
| API style | REST (built) + Server-Sent Events (📋 planned) |
| Security | Spring Security (JWT) — 📋 planned; current state: no auth, localhost-only |
| Port | 8080 |

Only the built items are present today: Spring Boot 3, Java 21, Maven, and REST (the single `POST /api/intents` endpoint plus `/actuator/health`). The database, cache, SSE, and security rows describe the target stack and have no corresponding dependency in `pom.xml` yet.

---

## Responsibilities

### Authentication and Authorization

📋 **Planned — not yet implemented.** The current Control Plane has **no authentication and is intended for localhost-only use**. There is no `security/` package and no Spring Security or JWT dependency in `pom.xml`.

In the target design, all inbound requests are authenticated: the Control Plane validates JWTs, resolves the caller to a user and tenant, and applies role-based access control before allowing any operation. This is the first production hardening task.

### Project Management

Projects are the primary organizational unit. A project has a name, a repository path, a tenant owner, and associated metadata. The Control Plane stores and retrieves project state, including the version history of knowledge graphs.

### Task Management

A Run is created for each intent submission. A Run contains one or more Tasks, each corresponding to a unit of agent work (frontend change, backend change, test generation). The Control Plane tracks task state: pending, dispatched, in-progress, completed, failed, awaiting-review.

### Multi-Tenancy

Every resource — projects, runs, tasks, graphs — is scoped to a tenant. The Control Plane enforces tenant isolation at every query boundary. No cross-tenant data access is possible at the API layer.

### API Gateway

The Control Plane is the single inbound API surface for the platform. It validates, routes, and rate-limits all requests. External integrations (webhooks from CI/CD systems, issue trackers) also enter through this gateway.

### Orchestration Entrypoint

The Control Plane dispatches work to the AI Runtime and collects results. It does not implement any agent logic itself — its role is to coordinate the sequence of agent calls that constitute a full intent lifecycle.

---

## Domain Model

```
Tenant
  └── Project
        └── Run
              ├── Intent (original text + metadata)
              ├── TaskGraph
              │     └── Task[]
              │           ├── kind: frontend | backend | test | review
              │           ├── status: pending | in_progress | completed | failed
              │           └── GenerationResult
              │                 ├── ChangeFile[]
              │                 └── VerificationResult
              └── RunStatus: submitted | planned | generating | verifying | awaiting_review | completed | failed
```

---

## API Surface

### Intent Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/intents | Submit an intent; creates and returns a Run |
| GET | /api/runs/{id} | Get run status and results |
| GET | /api/runs/{id}/stream | SSE stream of agent events |
| POST | /api/runs/{id}/approve | Approve plan or diff |
| POST | /api/runs/{id}/reject | Reject with feedback |

### Project Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/projects | List projects for current tenant |
| POST | /api/projects | Create a project |
| GET | /api/projects/{id} | Get project details |
| GET | /api/projects/{id}/graph | Get current knowledge graph |
| GET | /api/projects/{id}/runs | List runs for a project |

### Health

| Method | Path | Description |
|---|---|---|
| GET | /actuator/health | Spring Boot health endpoint |

---

## Orchestration Flow

When an intent is submitted:

1. Control Plane creates a `Run` with status `submitted`
2. Calls AI Runtime `POST /runs` with intent and project context
3. AI Runtime returns a `TaskGraph`
4. Control Plane stores tasks, updates Run status to `planned`
5. Returns Run to Frontend for review
6. On approval, Control Plane iterates tasks:
   - Dispatches each task to AI Runtime `POST /tasks/{id}/execute`
   - Updates task status as results stream back
7. When all tasks complete, Control Plane assembles the full diff
8. Updates Run status to `awaiting_review`
9. On approval, dispatches apply operation to Business Services
10. Updates Run status to `completed`

---

## Configuration

Key configuration properties (application.yml):

```yaml
evocode:
  runtime:
    base-url: http://localhost:8000
    timeout-seconds: 120
  storage:
    repo-base-path: /var/evocode/repos
  security:
    jwt-secret: ${JWT_SECRET}
    token-expiry-hours: 24
```

---

## Package Structure

```
com.evocode.controlplane
├── api/           # REST controllers
├── domain/        # JPA entities (Run, Task, Project, Tenant)
├── dto/           # Request/response objects matching contracts/
├── service/       # Business logic and orchestration
├── client/        # HTTP client for AI Runtime
├── security/      # JWT filter, RBAC
└── config/        # Spring configuration beans
```
