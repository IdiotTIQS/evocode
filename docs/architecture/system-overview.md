# System Overview

> **实现状态（截至 increment：鉴权 + 持久化 checkpointer） / Implementation Status**
> 本文档描述**目标架构**；下方区分已落地与计划中。端到端真实接线见 [docs/WIRING.md](../WIRING.md)。
> - ✅ 已构建：完整意图闭环 Frontend → Control Plane → AI Runtime；**JWT + RBAC 鉴权**（注册/登录，首用户 ADMIN，所有 `/api/**` 需 token，Project/Session/Run 按 ownerId 隔离）；**两段式审批门**（LangGraph `interrupt_before=["generate","apply"]`，批准前磁盘零写入）；**逐节点 SSE 实时流**（带 POST 降级）；7 节点流水线 understand→plan→architect→generate→verify→review→apply；**持久化**：Project/Session/Message/Run（控制平面 H2）+ 审批门 checkpoint（运行时 SqliteSaver，扛进程重启）；Run↔Session 关联；SQLite 知识图谱缓存。
> - 🚧 部分：codegen 仍是确定性模板（非真实 LLM 生成代码内容），只写 `evocode_generated/`；OpenAI provider 仅用于 plan 阶段。
> - 📋 计划中：多租户 Org 边界；`POST /api/runs/{id}/reject` 真后端（当前拒绝仅前端重置）；RAG/向量库；代码执行沙箱；git/PR 与 CI/CD；PostgreSQL/Redis；容器化。仍为**本地多进程、localhost 取向**（CORS 仅放行 localhost:3000，运行时自身无鉴权、信任控制平面）。

## Four-Layer Architecture

EvoCode is structured as four vertically integrated layers. Each layer has a single primary responsibility and communicates with adjacent layers through explicit HTTP contracts. No layer bypasses its neighbor to reach a deeper layer.

```
┌─────────────────────────────────────────────────────────┐
│              Frontend Console (Port 3000)               │
│         Next.js · React · TypeScript                    │
│  Intent submission · Plan review · Code diff · Approval │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP (REST + SSE)
┌──────────────────────────▼──────────────────────────────┐
│         Spring Boot Control Plane (Port 8080)           │
│  Authentication · Authorization · Orchestration         │
│  Project management · Task dispatch · State tracking    │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP (REST)
┌──────────────────────────▼──────────────────────────────┐
│           Python AI Runtime (Port 8000)                 │
│  LangGraph agent graph · Planner · Architect            │
│  Frontend/Backend/Review/Test agents · RAG · Memory     │
└──────────────────────────┬──────────────────────────────┘
                           │  Internal service calls
┌──────────────────────────▼──────────────────────────────┐
│              Business Services Layer                    │
│  Code execution · Repository I/O · Test runner          │
│  Static analysis · Storage · External integrations      │
└─────────────────────────────────────────────────────────┘
```

This describes the target architecture — the intended end state. It is the blueprint the implementation evolves toward; individual layers may be built out, refined, or adjusted across increments as the platform matures.

---

## Layer Responsibilities

### Frontend Console

The user-facing console built in Next.js and TypeScript. Developers interact with the platform here — they submit intents, review plans, inspect code diffs, and approve or reject changes. The frontend has no direct knowledge of agent internals and communicates exclusively with the Control Plane.

### Spring Boot Control Plane

The coordination hub. All inbound requests enter through the Control Plane, which handles authentication, authorization, project and task state, and dispatches work to the AI Runtime. The Control Plane owns the canonical state of every run — what was requested, what was planned, what was generated, and what was applied.

The Control Plane is also the multi-tenancy boundary. Every resource is scoped to a project and a tenant; the Control Plane enforces these boundaries before any downstream call.

### Python AI Runtime

The agent execution engine. The AI Runtime runs a LangGraph-defined agent graph that processes each phase of an intent lifecycle: understand, plan, architect, generate, verify. Each agent in the graph has a defined input/output schema and communicates with other agents through the graph's shared state.

The AI Runtime is stateless between requests. Persistent memory — the knowledge graph, past runs, embeddings — lives in the Business Services layer and is retrieved through the Runtime's RAG and memory tools.

### Business Services Layer

Everything the agents need that is not a language model call. This includes:

- Repository read/write (git operations, file I/O)
- Code execution and sandboxing
- Test runner integration
- Static analysis and linting
- Vector store for RAG
- Relational storage for project graphs and run history
- External integrations (CI/CD, issue trackers, PR platforms)

---

## Data Flow

### Intent Processing

```
Developer submits intent
  → Control Plane validates, creates Run record
  → Control Plane dispatches to AI Runtime: /runs
  → AI Runtime runs: understand → plan
  → Control Plane receives TaskGraph
  → Control Plane stores tasks, returns plan to Frontend
  → Developer reviews plan, approves
  → Control Plane dispatches each task to AI Runtime
  → AI Runtime runs: architect → generate → verify per task
  → Control Plane aggregates results, creates diff
  → Developer reviews diff, approves
  → Control Plane applies changes via Business Services
  → Run record updated: completed
```

### Knowledge Graph Updates

Every time a project is understood, the AI Runtime extracts the project's AST and populates a knowledge graph in the Business Services layer. Subsequent runs load this graph rather than re-extracting from scratch. The graph is versioned by a fingerprint of the repository state — a changed file invalidates the affected subgraph.

---

## Contract Boundary

All cross-layer communication uses schemas defined in `contracts/`. This directory is the single source of truth for request and response shapes. No layer invents its own interpretation of a shared type.

See [ADR-001](../adr/ADR-001-multi-language-architecture.md) for the rationale behind the multi-language architecture and the contract-first approach that makes it workable.
