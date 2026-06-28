# ADR-003: Python as the AI Runtime

## Status

Accepted

## 实现状态（截至 increment 6）

决策本身有效：选用 Python + FastAPI + LangGraph 作为 AI 运行时的方向成立且已落地。但本 ADR 的「Key libraries」清单把 LangChain、langchain-openai、ChromaDB、sentence-transformers、SQLAlchemy、aiosqlite/asyncpg、tree-sitter、tomllib 都列为技术栈，而实际 `ai-runtime/pyproject.toml` 仅含 `fastapi` / `uvicorn` / `pydantic` / `langgraph`（dev: `httpx` / `pytest`）。

- ✅ 已建：
  - LangGraph 6 节点流水线 understand→plan→architect→generate→verify→review
  - understand：Node `ts-morph` 抽取 + **stdlib `sqlite3`** 图缓存 + 影响分析
  - plan：默认确定性 StubLlmProvider；OpenAiLlmProvider 经 **`httpx`** 真实调用 OpenAI（仅 plan 阶段，受 `OPENAI_API_KEY` 门控）
  - architect / generate / verify / review 均为确定性实现（architect 读知识图谱，generate 写 `evocode_generated/` 模板，verify 只读 TS 类型检查，review 确定性裁定）
  - 提示词从 `docs/prompts/*.md` 加载
- 🚧 部分：codegen 仍是模板而非真实 LLM 生成代码内容；generate/architect/review 不调用 LLM
- 📋 计划中（pyproject.toml 无对应依赖）：LangChain、langchain-openai、ChromaDB、向量检索/RAG、sentence-transformers、SQLAlchemy（ORM）、aiosqlite/asyncpg、Postgres、tree-sitter、代码沙箱执行

### 关于版本叙述的更正

Context/Decision 中「Python 3.11，暂不升 3.12+ 直到 LangGraph 生态稳定」「LangGraph 生态尚不稳定」之类的表述已过时：实际已固定 **`langgraph==1.2.6`** 稳定版（1.2.x 系列），其余固定版本为 `fastapi==0.115.6`、`uvicorn==0.34.0`、`pydantic==2.10.4`。`requires-python` 为 `>=3.11`。`tomllib` 当前未用于配置解析。

## Date

2026-06-28

## Context

The AI Runtime must:

- Orchestrate a multi-step, multi-agent graph of LLM-powered agents
- Integrate with LLM APIs (OpenAI-compatible, Anthropic, local models)
- Use retrieval-augmented generation with embedding models and vector stores
- Extract and analyze code ASTs across multiple languages
- Execute generated code in sandboxed environments for verification
- Run at the center of a rapidly evolving AI tooling ecosystem

Python dominates the AI/ML tooling ecosystem. The critical libraries — LangGraph, LangChain, sentence-transformers, ChromaDB, tree-sitter — are Python-native. Their Java or TypeScript ports either do not exist, are significantly behind in capability, or lack community support.

LangGraph in particular is the right foundation for the agent graph: it provides a stateful, directed graph execution model with conditional edges, persistence, and streaming support. It is actively developed by LangChain, is well-documented, and is widely adopted for production agent systems.

Building the AI Runtime in any other language would require either reimplementing large portions of this ecosystem or accepting a permanent capability deficit against the Python baseline.

## Decision

The AI Runtime is implemented in Python 3.11 with FastAPI for the HTTP layer and LangGraph for agent graph execution.

Python 3.11 specifically, for:
- Performance improvements over 3.10 (10–60% faster in benchmarks relevant to agent workloads)
- `tomllib` for configuration parsing
- Improved error messages that aid debugging complex agent state issues
- Pinned version for reproducibility — not 3.12+ until the LangGraph ecosystem stabilizes

Key libraries:
- `fastapi` — async HTTP framework with automatic OpenAPI docs
- `langgraph` — stateful agent graph orchestration
- `langchain` — LLM abstractions, tool definitions, prompt templates
- `langchain-openai` — OpenAI-compatible LLM integration
- `chromadb` — vector store for RAG
- `sentence-transformers` — embedding models
- `pydantic` — data validation and serialization (aligns with FastAPI)
- `sqlalchemy` — ORM for the knowledge graph store
- `aiosqlite` / `asyncpg` — async database drivers

## Consequences

**Positive:**
- Full access to the Python AI/ML ecosystem
- LangGraph provides production-grade agent graph orchestration with persistence and streaming
- Pydantic + FastAPI provide type-safe request/response handling with automatic OpenAPI documentation
- Active community: issues, fixes, and new capabilities arrive faster than in any other language
- Deterministic stub LLM is easy to implement for local development without credentials

**Negative:**
- Python's GIL limits true CPU-level parallelism (mitigated by async I/O and process-level parallelism)
- Dynamic typing requires discipline and comprehensive Pydantic models to maintain correctness
- Python dependency management is historically complex (addressed by using a strict `pyproject.toml` with pinned versions)
- Python 3.11 is pinned — ecosystem upgrades require deliberate version bumps

**Mitigations:**
- All agent I/O is validated through Pydantic models
- `pyproject.toml` with pinned dependencies in `[project.optional-dependencies]` for dev/prod splits
- Virtual environment (`python -m venv .venv`) is the documented and required local setup
- Async FastAPI handles concurrent requests without GIL constraints at the I/O boundary

## Alternatives Considered

### Java / LangChain4j

Rejected. LangChain4j is a valid library but significantly behind Python LangChain in capability, documentation, and community adoption. LangGraph has no Java equivalent.

### TypeScript / LangChain.js

Rejected. LangChain.js is maintained but the TypeScript agent ecosystem lacks LangGraph's stateful graph model and the deep Python ML library integrations (sentence-transformers, advanced RAG patterns).

### Custom Agent Framework

Rejected. Building a custom agent orchestration framework would consume months of engineering time and produce an inferior result compared to LangGraph, which is actively maintained by a dedicated team.
