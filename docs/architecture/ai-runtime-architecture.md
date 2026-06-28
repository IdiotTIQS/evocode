# AI Runtime Architecture

> **实现状态（截至 increment 6） / Implementation Status (as of increment 6)**
> 本文档描述的是**目标架构**。AI Runtime 是目前最成熟的一层，但部分技术栈与端点仍为计划中。
> - ✅ 已构建：6 节点 LangGraph 流水线 understand→plan→architect→generate→verify→review；ts-morph（Node 子进程）抽取 + stdlib `sqlite3` 知识图谱缓存 + 影响分析；确定性 StubLlmProvider（默认）与门控的 OpenAiLlmProvider（plan 阶段、`OPENAI_API_KEY` 门控）；确定性 architect/generate/review；只读 TS 类型检查（verify）；提示词加载 `docs/prompts/*.md`。端点：`GET /health`、`POST /runs`。
> - 🚧 部分：codegen 仍是确定性模板（非真实 LLM 生成代码内容），只写 `evocode_generated/` 子目录、不改既有文件；OpenAI provider 仅用于 plan，generate/architect/review 不调用 LLM。
> - 📋 计划中：LangChain、ChromaDB、sentence-transformers、SQLAlchemy、tree-sitter；RAG / 向量检索 / memory 工具；Spring Boot 项目抽取；RENDERS/CALLS 边；自修复循环；`POST /tasks/{id}/execute` 端点（不存在）。

## Overview

The AI Runtime is the agent execution engine. It is a Python service that runs a LangGraph-defined graph of specialized agents. Each agent in the graph has a bounded responsibility, a defined input/output schema, and access to a set of tools for reading and modifying the software under development.

The AI Runtime is stateless between requests. All persistent data — knowledge graphs, run history, embeddings — lives in the Business Services layer and is accessed through tool calls within the agent graph.

---

## Technology Stack

| Concern | Choice |
|---|---|
| Language | Python 3.11 |
| Framework | FastAPI |
| Agent orchestration | LangGraph |
| LLM integration | Direct `httpx` calls to OpenAI-compatible endpoints (✅) — LangChain is 📋 planned, not a dependency |
| Default LLM | Deterministic stub (default) / OpenAI-compatible (`OPENAI_API_KEY` gated) |
| Code extraction | Node `ts-morph` subprocess (✅) — tree-sitter is 📋 planned |
| Embedding | text-embedding-3-small (or compatible) — 📋 planned |
| Vector store | ChromaDB — 📋 planned |
| Graph / relational store | stdlib `sqlite3` (✅) — SQLAlchemy / PostgreSQL are 📋 planned |
| Port | 8000 |

The actual `pyproject.toml` declares only `fastapi`, `uvicorn`, `pydantic`, and `langgraph` (plus dev: `httpx`, `pytest`). LangChain, ChromaDB, sentence-transformers, SQLAlchemy, and tree-sitter are **planned** and not yet installed. The knowledge graph is persisted with the standard-library `sqlite3` module (no ORM), and TypeScript/React extraction runs through a Node `ts-morph` subprocess.

---

## Agent Graph

> **实现状态**：当前实现是一条线性的 6 节点流水线 **understand → plan → architect → generate → verify → review**（已含 increment 6）。下方按任务类型分支（frontend/backend/test 分别走不同 generate 节点）的图描述的是**目标设计**；目前只有单一确定性的 `generate` 节点，且按模板写入 `evocode_generated/`。

The agent graph is a directed graph of nodes (agents) connected by conditional edges. The graph processes each intent through a defined sequence of phases.

```
understand → plan → architect → generate → verify → review
```

The branched diagram below (per-task-kind generate nodes) is the **target** shape of the graph; the current implementation runs the single linear pipeline above.

```
understand
    │
    ▼
plan
    │
    ├── [task: frontend] ──► architect ──► frontend-generate ──► verify
    │
    ├── [task: backend]  ──► architect ──► backend-generate  ──► verify
    │
    └── [task: test]     ──────────────► test-generate      ──► verify
                                                │
                                          review (all tasks complete)
```

### Phases

**understand** — Extracts the project's structure into a knowledge graph. Runs the TypeScript extractor (for React/Next.js projects) or the Java AST analyzer (for Spring Boot projects). Computes impact and dependency edges. Stores the graph and returns stats.

**plan** — Takes the intent and the knowledge graph stats. Produces a `TaskGraph`: an ordered list of tasks, each with a kind, title, description, and affected file hints.

**architect** — Evaluates the architectural implications of a specific task. Identifies which existing components are affected, what new abstractions are needed, and whether any constraints (naming conventions, existing patterns) must be respected.

**frontend-generate** — Implements a frontend task. Produces file changes: new components, modifications to existing ones, routing updates, style changes.

**backend-generate** — Implements a backend task. Produces file changes: new controllers, services, repositories, domain models, migrations.

**test-generate** — Generates tests for the changes produced by frontend or backend agents.

**verify** — Runs static analysis, type checking, and available tests against the generated changes. Reports pass/fail with diagnostics.

**review** — Evaluates the complete set of changes for correctness, consistency, and quality. Produces a structured review with findings categorized by severity.

---

## State Schema

The LangGraph graph passes a shared state object between nodes:

```python
class RunState(TypedDict):
    intent: str
    project_id: str
    repo_path: Optional[str]
    knowledge_graph: Optional[ProjectGraph]
    graph_stats: Optional[GraphStats]
    task_graph: Optional[TaskGraph]
    current_task: Optional[Task]
    architecture_notes: Optional[ArchitectureNotes]
    change_files: List[ChangeFile]
    verification_result: Optional[VerificationResult]
    review_findings: List[ReviewFinding]
    phase: str
    error: Optional[str]
```

---

## Tool Definitions

> **实现状态**：📋 此处描述的 LangChain 工具体系为目标设计。当前节点直接调用内部 Python 函数（如 ts-morph 抽取、SQLite 图查询、只读 TS 类型检查），尚无 LangChain 工具层；`search_code`、`retrieve_context` 等语义检索工具未实现。

Agents operate through LangChain tools. Tools are the only mechanism by which agents interact with the outside world.

| Tool | Description |
|---|---|
| `read_file` | Read a file from the repository under development |
| `write_file` | Write a file (staged, not committed) |
| `list_files` | List files in a directory with optional glob pattern |
| `search_code` | Full-text and semantic search over the knowledge graph |
| `get_component` | Retrieve a specific component from the graph |
| `get_dependencies` | Get the dependency tree for a file |
| `get_impact` | Get the reverse dependency (impact) set for a file |
| `run_tests` | Execute the test suite and return results |
| `run_lint` | Run static analysis and return findings |
| `run_typecheck` | Run TypeScript or Java type checking |
| `retrieve_context` | RAG retrieval over the project knowledge base |

---

## Memory and RAG

> **实现状态**：📋 计划中。当前无向量索引、无 RAG 检索、无 `retrieve_context` 工具。下文描述目标设计。

Each project maintains a vector index of its knowledge graph, documentation, and change history. Agents retrieve relevant context at the beginning of each task using the `retrieve_context` tool.

Memory is project-scoped. Cross-project memory is not supported — each project's knowledge is isolated.

---

## LLM Configuration

The runtime selects an LLM backend based on environment:

- If no `OPENAI_API_KEY` is set, a deterministic stub LLM is used. The stub always returns well-formed but simplified responses. This enables development and testing without credentials.
- If `OPENAI_API_KEY` is set, the runtime uses the OpenAI-compatible endpoint. `OPENAI_BASE_URL` overrides the endpoint (for Azure OpenAI, local Ollama, or other compatible providers). `OPENAI_MODEL` overrides the model name.

---

## API Surface

| Method | Path | Description |
|---|---|---|
| POST | /runs | Start a full run (understand → plan → architect → generate → verify → review) — ✅ built |
| POST | /tasks/{id}/execute | Execute a single task — 📋 planned, does not exist |
| GET | /health | Health check — ✅ built |

Today only `GET /health` and `POST /runs` exist. `POST /runs` runs the entire pipeline in one call; the per-task `POST /tasks/{id}/execute` endpoint is planned and not implemented.

---

## Package Structure

```
evocode_runtime/
├── main.py              # FastAPI app and route definitions
├── graph/
│   ├── run_graph.py     # LangGraph graph definition
│   ├── state.py         # RunState TypedDict
│   └── nodes/           # One file per agent node
│       ├── understand.py
│       ├── plan.py
│       ├── architect.py
│       ├── frontend_generate.py
│       ├── backend_generate.py
│       ├── test_generate.py
│       ├── verify.py
│       └── review.py
├── tools/               # LangChain tool definitions
├── memory/              # Knowledge graph store and vector index
├── llm/                 # LLM provider selection and stub
└── models/              # Pydantic models matching contracts/
```
