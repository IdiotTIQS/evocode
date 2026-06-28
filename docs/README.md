# EvoCode (IntentOS) Documentation

EvoCode is an autonomous software engineering platform where developers describe intent and agents design, implement, test, review, and evolve software continuously.

> **Intent is the new source code. Agents build. Humans decide.**

---

## Documentation Map

### Vision & Strategy

| Document | Description |
|---|---|
| [Vision](vision/vision.md) | The long-term destination and philosophy |
| [Mission](vision/mission.md) | What we do and why it matters |
| [Product Positioning](vision/product-positioning.md) | What EvoCode is and is not |
| [Roadmap](vision/roadmap.md) | Phased delivery plan |

### Architecture

| Document | Description |
|---|---|
| [System Overview](architecture/system-overview.md) | Four-layer architecture and data flow |
| [Frontend Architecture](architecture/frontend-architecture.md) | Next.js console and UI layer |
| [Control Plane Architecture](architecture/control-plane-architecture.md) | Spring Boot orchestration layer |
| [AI Runtime Architecture](architecture/ai-runtime-architecture.md) | Python + LangGraph agent runtime |
| [Business Services Architecture](architecture/business-services-architecture.md) | Supporting services and infrastructure |
| [Deployment Architecture](architecture/deployment-architecture.md) | Container, networking, and environment topology |

### Architecture Decision Records

| ADR | Decision |
|---|---|
| [ADR-001](adr/ADR-001-multi-language-architecture.md) | Multi-language distributed architecture |
| [ADR-002](adr/ADR-002-java-control-plane.md) | Java / Spring Boot as the Control Plane |
| [ADR-003](adr/ADR-003-python-agent-runtime.md) | Python as the AI Runtime |
| [ADR-004](adr/ADR-004-software-as-knowledge-graph.md) | Software modeled as a knowledge graph |
| [ADR-005](adr/ADR-005-intent-driven-development.md) | Intent-driven Development as the core paradigm |

### Agents

| Document | Description |
|---|---|
| [Planner Agent](agents/planner-agent.md) | Converts requirements into engineering tasks |
| [Architect Agent](agents/architect-agent.md) | Makes architecture decisions and evaluates impact |
| [Frontend Agent](agents/frontend-agent.md) | UI, components, state, and routing |
| [Backend Agent](agents/backend-agent.md) | APIs, domain models, and persistence |
| [Review Agent](agents/review-agent.md) | Code review and quality gate |
| [Test Agent](agents/test-agent.md) | Test generation and validation strategy |

### Prompts

| Document | Description |
|---|---|
| [Master Prompt](prompts/master-prompt.md) | System-level identity and operating principles |
| [Planner Prompt](prompts/planner-prompt.md) | Planning agent instructions |
| [Architect Prompt](prompts/architect-prompt.md) | Architecture agent instructions |
| [Frontend Prompt](prompts/frontend-prompt.md) | Frontend agent instructions |
| [Backend Prompt](prompts/backend-prompt.md) | Backend agent instructions |
| [Review Prompt](prompts/review-prompt.md) | Review agent instructions |
| [Test Prompt](prompts/test-prompt.md) | Test agent instructions |

### MVP

| Document | Description |
|---|---|
| [MVP Scope](mvp/mvp-scope.md) | What is in scope for the first release |
| [Implementation Phases](mvp/implementation-phases.md) | Sequenced delivery phases |
| [First Milestone](mvp/first-milestone.md) | Definition of done for the first milestone |

---

## 当前实现状态 (Current Implementation Status)

EvoCode 当前是一个**可端到端跑通的最小闭环**，而非完整平台。下面如实区分已建成与计划中的部分，避免文档与代码脱节。

**已跑通的核心闭环 (Built):** 流水线 understand → plan → architect → generate → verify → review 六个阶段在本地可端到端运行：

- 意图提交与结果渲染 — [Frontend Architecture](architecture/frontend-architecture.md)（Next.js 控制台）
- 意图转发与契约镜像 — [Control Plane Architecture](architecture/control-plane-architecture.md)（Spring Boot，`POST /api/intents`）
- 六节点 LangGraph 流水线 — [AI Runtime Architecture](architecture/ai-runtime-architecture.md)（understand 用 ts-morph + SQLite 图缓存；plan 默认确定性 stub，可选 OpenAI；architect/generate/verify/review 为确定性实现）
- 跨层契约（含 ReviewOutput / ReviewFinding）— [contracts/README.md](../contracts/README.md)

**仍为计划中的平台级能力 (Planned):** 以下能力在文档中描述，但**代码中尚无实现**，请勿据此假设其已可用：

- 鉴权与授权（JWT / RBAC）、多租户边界 — 详见 [Control Plane Architecture](architecture/control-plane-architecture.md)
- 持久化（Spring Data JPA / PostgreSQL、Run 状态持久化、Redis 队列）
- 代码执行沙箱、Git / PR 集成、CI/CD — 详见 [Business Services Architecture](architecture/business-services-architecture.md)
- RAG / 向量检索（ChromaDB）、长期记忆、tree-sitter
- 审批门（plan / diff approve-reject）、SSE 实时事件、项目图视图

> 真实事实来源以代码与 `.superpowers/sdd/doc-status-baseline.md` 为准。各架构文档中以现在时态描述的未建成能力，应理解为目标 / 计划，而非现状。

---

## Core Principles

1. **Intent First** — requirements precede code
2. **Architecture Before Code** — design decisions are explicit and recorded
3. **Understand Before Modify** — agents build a knowledge graph before changing anything
4. **Continuous Evolution** — software is never finished, only evolved
5. **Minimal Change Principle** — targeted edits, not rewrites
6. **Software as Knowledge Graph** — components, relationships, and dependencies are first-class citizens
7. **Agents as Team Members** — each agent has a defined role, responsibility, and operating boundary

---

## Getting Started

See the root [README.md](../README.md) for local development setup, startup order, and verified end-to-end checks.
