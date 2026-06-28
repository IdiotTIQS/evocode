# ADR-004: Software as a Knowledge Graph

## Status

Accepted

## 实现状态（截至 increment 6）

方向性决策成立：将代码库建模为可查询的知识图谱已落地为最小可用版本，存储基于 **stdlib `sqlite3`**（pkg/store.py），非 SQLAlchemy/向量库。当前 schema 与操作覆盖核心子集。

- ✅ 已建：
  - 节点类型 `File` / `Component`
  - 边类型 `IMPORTS` / `DEFINES`
  - 影响分析（基于 IMPORTS 的反向遍历）+ 依赖遍历
  - Node `ts-morph` 抽取 TypeScript/React + SQLite 图缓存
- 📋 计划中：
  - 其余节点类型 `Function` / `ApiEndpoint` / `DomainModel` / `Module`
  - 其余边类型 `EXTENDS` / `IMPLEMENTS` / `CALLS` / `RENDERS` / `DEPENDS_ON`
  - Spring Boot / Java 项目抽取（当前仅 TS 抽取器）
  - 语义相似度搜索 `search(query, k)` 与向量/RAG（无 embedding 模型、无向量库）
  - 基于仓库指纹的多版本保留与历史查询

## Date

2026-06-28

## Context

Autonomous agents cannot make good engineering decisions from raw files. A file is an opaque blob of text without context. To understand a codebase well enough to modify it correctly, an agent needs to know:

- What components exist and what they do
- How they relate to each other (imports, API calls, event subscriptions)
- Which components are stable and which are volatile
- What changes to one component imply for others
- The history of how the codebase has evolved and why

A flat file list does not answer these questions. A traditional text search does not answer them either. A knowledge graph does.

A knowledge graph represents the codebase as a set of nodes (files, components, functions, API endpoints, domain models) connected by typed edges (imports, extends, calls, depends-on). This representation makes the following operations efficient and accurate:

- **Dependency traversal**: given a component, find everything it depends on
- **Impact analysis**: given a component, find everything that would be affected if it changed
- **Contextual retrieval**: given an intent, find the most relevant components using semantic similarity over graph nodes
- **Change validation**: given a set of proposed changes, verify that all affected components are accounted for in the plan

This structural knowledge is what elevates agents from text generators to engineering participants. Without it, agents produce code that may be locally correct but globally broken.

## Decision

EvoCode models every project's codebase as a knowledge graph: a versioned, queryable graph of nodes and typed edges extracted from the source code.

### Graph Schema

**Node types:**
- `File` — a source file in the repository
- `Component` — a React component, Vue component, or similar UI unit
- `Function` — a standalone function or method
- `ApiEndpoint` — a REST endpoint (Spring controller method or Next.js API route)
- `DomainModel` — a JPA entity, Pydantic model, or TypeScript interface
- `Module` — an importable module or package boundary

**Edge types:**
- `IMPORTS` — file A imports from file B
- `EXTENDS` — class A extends class B
- `IMPLEMENTS` — class A implements interface B
- `CALLS` — function A calls function B
- `RENDERS` — component A renders component B
- `DEPENDS_ON` — generic dependency edge for cases not covered above

### Graph Operations Required

- `get_node(id)` — retrieve a node by its ID
- `get_neighbors(id, edge_type, direction)` — get nodes connected by a specific edge type
- `get_dependencies(file_id)` — transitive closure of IMPORTS edges (what this file depends on)
- `get_impact(file_id)` — reverse transitive closure of IMPORTS edges (what changes if this file changes)
- `search(query, k)` — semantic similarity search over node descriptions

### Versioning

The graph is versioned by a repository fingerprint: a hash of all file paths, sizes, and modification times. When the fingerprint changes, a new graph version is extracted and stored. Prior versions are retained (never deleted) to support historical queries and rollback analysis.

## Consequences

**Positive:**
- Agents make decisions with full awareness of the impact of their changes
- Impact analysis prevents agents from generating locally correct but globally breaking changes
- Semantic search over the graph enables high-precision context retrieval for RAG
- The graph is a reusable artifact — the extraction cost is paid once per repo state

**Negative:**
- Graph extraction adds latency to the first run against a repository (typically seconds to tens of seconds for large codebases)
- Graph accuracy depends on the quality of the extractor — incomplete extraction leads to missed dependencies
- The graph schema must be extended as new languages and frameworks are added

**Mitigations:**
- Graph caching with fingerprint-based invalidation means extraction only runs when the repo actually changes
- Extractors are isolated per language — adding TypeScript support does not require modifying the Java extractor
- The graph schema is designed for extension: unknown node and edge types are stored as generic nodes/edges and can be reclassified when a new extractor supports them

## Alternatives Considered

### Raw File Search (grep / regex)

Rejected for agent use. Text search finds occurrences but not relationships. An agent using text search cannot determine the impact of changing a component or whether a proposed import will cause a circular dependency.

### AST-Only Analysis (no graph)

Rejected. A per-file AST gives structural information about individual files but not the relationships between them. Cross-file dependency analysis requires a graph.

### Embeddings Only (no structural graph)

Rejected as the primary representation. Semantic similarity is useful for retrieval but unreliable for structural queries (dependency traversal, impact analysis). The knowledge graph combines structural edges for precise queries with embeddings for fuzzy retrieval.
