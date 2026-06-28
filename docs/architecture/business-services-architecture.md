# Business Services Architecture

> **实现状态（截至 increment 6） / Implementation Status (as of increment 6)**
> 本文档描述的是**目标架构**。该层目前基本未建：`services/` 目录下仅有 `README.md`，没有独立的业务服务实现。
> - ✅ 已构建：唯一真实存在的部分是知识图谱存储，使用标准库 `sqlite3`（`ai-runtime` 的 `pkg/store.py`）持久化 `ProjectGraph`、按指纹版本化、提供组件/依赖/影响查询。
> - 📋 计划中：仓库服务（git 操作 / PR 创建）、代码执行与沙箱、测试运行器、向量库（ChromaDB）/ RAG、CI/CD 与 PR / Issue Tracker 集成、PostgreSQL 后端、隔离工作区与资源限制——均无实现。
>
> 当前知识图谱操作以库形式在 AI Runtime 进程内运行；代码执行、沙箱、向量检索与外部集成都尚未编写。下文描述的服务清单是目标设计。

## Overview

The Business Services layer is the execution substrate for the EvoCode platform. It provides the infrastructure capabilities that agents depend on: code execution, repository I/O, test running, storage, and external integrations. Agents access these capabilities through tool calls within the AI Runtime — they never call Business Services directly.

The Business Services layer has no agent logic and no LLM calls. It is responsible for safe, correct execution of concrete operations against real artifacts.

---

## Service Inventory

### Repository Service

> 📋 **计划中** — 当前没有仓库服务实现；git 操作、工作区克隆与暂存/应用变更均未编写。

Handles all file system and git operations against the codebases under development.

**Capabilities:**
- Clone a repository to a working directory
- Read and write files within a sandboxed workspace
- Stage and apply changes (create commits or pull requests)
- Compute repository fingerprints for knowledge graph versioning
- Enumerate files with glob patterns

**Implementation:** A Python service (called as a library within the AI Runtime) or a separate microservice for multi-tenant isolation. In production, each run operates in an isolated workspace — a shallow clone or a worktree — to prevent concurrent run interference.

### Code Execution Service

> 📋 **计划中** — 无沙箱、无容器化执行、无资源限制。当前 verify 阶段仅在 AI Runtime 内做只读 TypeScript 类型检查，不运行任意生成代码。

Runs arbitrary code in a sandboxed environment. Used by the verify phase to execute tests, type checkers, and linters against generated changes.

**Capabilities:**
- Execute shell commands with resource limits (CPU, memory, wall-clock timeout)
- Return stdout, stderr, and exit code
- Support for Node.js (TypeScript, Jest), Python (pytest), and Java (Maven/Gradle) runtimes
- Isolation: each execution runs in a disposable container or subprocess

**Security model:** Execution is strictly sandboxed. Generated code cannot access the network, the host file system outside its workspace, or any credentials.

### Knowledge Graph Store

> ✅ **已构建** — 这是本层唯一真实实现：用标准库 `sqlite3`（`ai-runtime` 的 `pkg/store.py`）持久化与查询知识图谱，无 ORM。生产 PostgreSQL 后端为 📋 计划中。

Stores and retrieves the structured knowledge graphs extracted from project codebases.

**Capabilities:**
- Persist a `ProjectGraph` (nodes: files, components, APIs; edges: imports, dependencies, API calls)
- Version graphs by repository fingerprint
- Query: get component by ID, get dependencies, get impact set, get all components by kind
- Mark prior versions as superseded (never deleted — full history retained)

**Storage backend:** SQLite in local development, PostgreSQL in production. The store interface is an abstraction — swapping backends requires no change to callers.

### Vector Store

> 📋 **计划中** — 无 ChromaDB、无嵌入、无向量检索。RAG 能力尚未实现。

Stores embeddings of knowledge graph content, documentation, and change history for retrieval-augmented generation.

**Capabilities:**
- Index: embed and store chunks of project content (component descriptions, API schemas, change summaries)
- Retrieve: given a query string, return the top-k most semantically similar chunks
- Scope: all queries are scoped to a project ID — cross-project retrieval is not supported

**Storage backend:** ChromaDB in local development, a hosted vector database in production.

### Relational Store

Stores structured platform data: tenants, projects, runs, tasks, events.

This is distinct from the knowledge graph store (which stores extracted code structure) and the Control Plane's database (which owns the authoritative run state). The Business Services relational store holds data that the AI Runtime needs direct access to — primarily the knowledge graph metadata and extracted graph content.

**Storage backend:** SQLite in local development (`ai-runtime/data/pkg.db`), PostgreSQL in production.

---

## External Integrations

> 📋 **计划中** — CI/CD、Pull Request、Issue Tracker 集成均无实现。下文描述目标设计与分阶段计划。

### CI/CD Integration

The Business Services layer provides adapters for triggering and reading CI/CD pipelines. After changes are applied, the platform can trigger a CI run and monitor its result.

**Supported systems:** GitHub Actions (Phase 4), GitLab CI (Phase 5), generic webhook trigger.

### Pull Request Integration

After changes are applied and approved, the platform creates a pull request (or merge request) against the project's repository. The PR includes a structured description: the original intent, the plan summary, the agents involved, and the verification results.

**Supported systems:** GitHub (Phase 3), GitLab (Phase 5).

### Issue Tracker Integration

Future: the platform can link generated changes back to issue tracker tickets (Jira, Linear, GitHub Issues) and close or update them when a run completes.

---

## Sandboxing Model

> 📋 **计划中** — 当前无隔离工作区、无容器化、无资源限制；尚未执行任何 LLM 生成的代码。下文是目标安全模型。

All code execution and file I/O is sandboxed:

- Each run gets an isolated workspace directory
- Workspaces are created at run start and cleaned up at run completion
- Execution containers have no network access
- File writes are scoped to the workspace — agents cannot write outside it
- Resource limits prevent runaway processes from affecting the host

This sandboxing model makes it safe to execute untrusted, LLM-generated code during the verify phase.

---

## Deployment Topology

In local development, all business services run in-process within the AI Runtime. In production:

| Service | Local | Production |
|---|---|---|
| Repository Service | In-process (filesystem) | Isolated container per run |
| Code Execution | Subprocess | Docker-in-Docker or external runner |
| Knowledge Graph Store | SQLite | PostgreSQL |
| Vector Store | ChromaDB (in-process) | Hosted vector DB |
| Relational Store | SQLite | PostgreSQL |
