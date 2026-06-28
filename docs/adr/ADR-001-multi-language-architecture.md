# ADR-001: Multi-Language Distributed Architecture

## Status

Accepted

## 实现状态（截至 increment 6）

方向性决策成立：多语言分层（TS 前端 / Java 控制平面 / Python AI 运行时）已落地为三个真实运行的进程，通过 HTTP REST + `contracts/` JSON schema 通信。

- ✅ 已落地：TS/Next.js 前端、Java/Spring Boot 控制平面、Python/FastAPI/LangGraph AI 运行时三层各自存在并可运行；`contracts/` 作为跨层类型单一事实来源；各层本地镜像 DTO。
- 🚧 部分：契约镜像存在但 `contracts/README.md` 尚未列全部分类型（ProjectGraphStats/ChangeFile/Diagnostic/VerificationResult/ReviewOutput）。
- 📋 计划中：Business Services 层（目前 `services/` 仅 README）、Docker Compose 全栈环境、控制平面的安全/多租户/可观测性高级能力（见 ADR-002）、Python 端的完整 AI/ML 生态（见 ADR-003）、protobuf/OpenAPI 代码生成升级路径。

注：本节及下文 Decision 中提到的「Spring Security/多租户」「LangChain/sentence-transformers/ChromaDB」属于目标技术栈描述，其当前实现状态以 ADR-002、ADR-003 的实现状态小节为准。

## Date

2026-06-28

## Context

EvoCode requires multiple specialized capabilities that are best served by different technology ecosystems:

- **Enterprise API management, security, and orchestration** are well-served by the JVM ecosystem (Spring Boot, Spring Security, Spring Data). The JVM provides mature libraries, strong operational tooling (Actuator, Micrometer), and a type-safe development model appropriate for the platform's coordination layer.

- **AI agent execution, LLM integration, and knowledge graph tooling** are best served by Python. The Python AI/ML ecosystem (LangChain, LangGraph, sentence-transformers, ChromaDB) has no equivalent in other languages. Building the agent runtime in Java or TypeScript would require either reimplementing this ecosystem or accepting inferior tooling.

- **The developer console** is naturally a Next.js/TypeScript application. The frontend has no AI-specific requirements — it consumes REST APIs and renders structured data. TypeScript is the appropriate choice for the UI layer.

A single-language architecture would require either:
- Using Java for everything: an inferior developer experience for AI/ML work and no access to the LLM ecosystem
- Using Python for everything: no mature enterprise-grade security and orchestration framework
- Using TypeScript/Node.js for everything: inappropriate for both the AI runtime and the enterprise control plane

The multi-language architecture is the only path that gives each layer its best-fit technology.

## Decision

EvoCode is implemented as a multi-language distributed system:

- **Frontend**: TypeScript / Next.js
- **Control Plane**: Java / Spring Boot
- **AI Runtime**: Python / FastAPI / LangGraph
- **Business Services**: Python (in-process with AI Runtime) or Java (if isolated microservices are needed)

Layers communicate through HTTP REST APIs with contract schemas defined in `contracts/`. The contract directory is the single source of truth for cross-layer types. Each layer implements its own local model classes from the shared schemas — no runtime type sharing across language boundaries.

## Consequences

**Positive:**
- Each layer uses the best technology for its requirements
- Full access to the Python AI/ML ecosystem in the AI Runtime
- Spring Boot's enterprise features (security, multi-tenancy, observability) in the Control Plane
- Teams can work independently on each layer
- Layers can be scaled independently

**Negative:**
- More operational complexity: multiple runtimes, multiple build systems
- Contract drift risk: if the shared schemas in `contracts/` fall out of sync with implementations, cross-layer communication breaks
- Higher onboarding cost: contributors may need to understand multiple languages and frameworks

**Mitigations:**
- The `contracts/` directory enforces a single schema source of truth
- Integration tests at the Control Plane ↔ AI Runtime boundary catch contract drift
- Docker Compose provides a reproducible full-stack local environment

## Alternatives Considered

### Single Python Service

Rejected. Python does not have a mature enterprise API framework comparable to Spring Boot. Authentication, multi-tenancy, and operational features would require significant custom development.

### Single Java Service

Rejected. The Python AI/ML ecosystem (LangGraph, LangChain, sentence-transformers) has no Java equivalent. Using Java for agent orchestration would block access to the fastest-moving part of the AI tooling landscape.

### Monorepo with Shared Types (e.g., Protobuf)

Considered for a future increment. Currently using JSON schemas in `contracts/` is simpler and sufficient. If the contract surface grows significantly, protobuf or OpenAPI code generation is a viable upgrade path without changing the architecture.
