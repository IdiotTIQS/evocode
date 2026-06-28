# Implementation Phases

## 实现状态 (Implementation Status)

> 本节对照 `.superpowers/sdd/doc-status-baseline.md` 更正各 increment 的真实状态。图例：✅ 已构建 / 🚧 部分 / 📋 计划中。下方原始蓝图保留不删，但其中标为 "Complete" / "Current" 的部分**并非全部已交付**，以本节为准。

真实情况：六节点流水线 understand → plan → architect → generate → verify → review 已端到端跑通（仅 React/Next.js），但各 increment 中混入的平台级能力（鉴权、PR 集成、SSE、测试生成、后端生成、自修复、变更落盘）大多**尚未建成**。

- **Increment 0 — 🚧 部分**：四层骨架、LangGraph understand/plan、ts-morph 抽取、IMPORTS 边、Planner→TaskGraph、stub LLM、意图 UI、端到端 intent→plan ✅ 均真实。
- **Increment 1 — 🚧 部分**：✅ 影响分析 `get_impact`、按指纹缓存到 SQLite、Architect 产出 ArchitectureNotes。📋 **未建**：Spring Boot 抽取、函数级/端点/领域节点、RAG / ChromaDB、`retrieve_context`、PostgreSQL 持久化。
- **Increment 2 — 🚧 部分**：✅ generate 写文件、Review Agent 裁定。🚧 生成为确定性模板、写入 `evocode_generated/` 子目录、不改既有文件。📋 **未建**：沙箱化 `write_file`、Diff 查看器、审批门（approve/reject）、变更落盘到仓库。
- **Increment 3 — 📋 计划中（非已交付）**：Backend Agent（Spring Boot 生成）、OpenAPI 注解、PR 创建（GitHub API）、任务并行调度**均未实现**。
- **Increment 4 — 📋 大部分计划中**：✅ 仅 verify 阶段的只读 `tsc --noEmit`。📋 **未建**：Test Agent（Jest/RTL、JUnit）、`mvn test`、ESLint、**自修复循环**、覆盖率评估。
- **Increment 5 — 🚧 部分（非已交付）**：✅ understand→plan→architect→generate→verify→review 闭环、stub/OpenAI provider。📋 **未建**：apply 阶段（变更落盘）、plan/diff **审批门**、完整审计追踪、**SSE 事件流**、**项目图视图**、per-run 报告。
- **Future Increments（6-10）— 📋 计划中**：鉴权/多租户、持续演进、CI/CD、长期记忆、干系人意图均未实现，与原文一致。

> 注：原文将 PR 集成放在 increment 3、SSE 与项目图视图放在 increment 5 并标为已交付/当前，实际代码中均无对应实现，已在上方更正为 📋。

---

## Overview

EvoCode is built incrementally. Each increment delivers a working, end-to-end capability that can be demonstrated and validated before the next increment begins. No increment is purely internal infrastructure — every increment produces something a developer can use.

---

## Increment 0 — Infrastructure and Skeleton (Complete)

**Delivered:**
- Four-layer architecture: Frontend (Next.js), Control Plane (Spring Boot), AI Runtime (Python/FastAPI), Business Services
- LangGraph agent graph skeleton with understand and plan nodes
- TypeScript extractor (ts-morph) for React/Next.js project analysis
- Knowledge graph construction: File and Component nodes, IMPORTS edges
- Planner agent producing a structured TaskGraph
- Control Plane orchestration: intent submission, run tracking, result return
- Deterministic stub LLM for local development without credentials
- Intent submission UI in the frontend console
- Full end-to-end: intent → understand → plan → TaskGraph returned to frontend

**Verification:** `curl -X POST http://localhost:8080/api/intents -d '{"intent":"add product page","projectId":"shop"}' | jq .taskGraph`

---

## Increment 1 — Project Understanding Depth

**Goal:** Agents have enough context to make accurate implementation decisions.

**Delivers:**
- Spring Boot project extractor: controllers, services, repositories, entities, DTOs
- Knowledge graph depth: function-level nodes, API endpoint nodes, domain model nodes
- Cross-file import edge resolution (transitive)
- Impact analysis: `get_impact(file_id)` — reverse transitive closure of IMPORTS
- Graph persistence with fingerprint-based versioning (SQLite → PostgreSQL)
- RAG: ChromaDB integration, embedding of component descriptions
- `retrieve_context` tool available to all agents
- Architect agent: reads graph, produces ArchitectureNotes per task

**Verification:** Submit an intent against a real Spring Boot + Next.js project. Verify the resulting TaskGraph references specific existing files from the project, not generic placeholders.

---

## Increment 2 — Frontend Code Generation

**Goal:** The platform can implement frontend tasks end-to-end.

**Delivers:**
- Frontend Agent: reads architecture notes, reads existing components, generates React components and Next.js pages
- `write_file` tool with sandboxed workspace
- Change file collection: all generated files aggregated into a ChangeFile list
- Diff viewer in the frontend console
- Review Agent: automated code review with verdict and findings
- Frontend console review interface: show diff + review findings, approve/reject
- Apply approved frontend changes to the repository (write files)

**Verification:** Submit "add a product list page with a ProductCard component" against a real Next.js project. Approve the plan and diff. Verify the generated files are correct TypeScript/React, follow project conventions, and appear in the repository.

---

## Increment 3 — Backend Code Generation

**Goal:** The platform can implement full-stack features end-to-end.

**Delivers:**
- Backend Agent: generates Spring Boot controllers, services, repositories, entities, DTOs, migrations
- OpenAPI annotation generation
- Cross-layer consistency: Architect ensures frontend and backend tasks agree on API contract shape
- Pull request creation (GitHub API integration)
- Control Plane task parallelism: frontend and backend tasks dispatched concurrently when no dependency

**Verification:** Submit "add a comments API and a frontend comments section" against a real Spring Boot + Next.js project. Verify the generated backend creates a working endpoint, the frontend calls it correctly, and a pull request is created.

---

## Increment 4 — Test Generation and Verification

**Goal:** Every run produces verified, tested changes.

**Delivers:**
- Test Agent: generates Jest + RTL tests for React components
- Test Agent: generates JUnit 5 + @WebMvcTest tests for Spring Boot controllers
- Verify phase: runs `tsc --noEmit`, `mvn test`, `eslint` against the sandboxed workspace
- Verification results surfaced in frontend console (pass/fail, error messages)
- Self-repair loop: on verification failure, re-dispatch generation with failure context
- Review Agent updated to include test coverage assessment

**Verification:** Submit an intent, verify that tests are generated, that they pass in the verify phase, and that the self-repair loop fixes a deliberately introduced type error.

---

## Increment 5 — Complete Autonomous Engineering Loop (Current)

**Goal:** The platform operates the full intent-to-verified-code loop without manual intervention for the happy path.

**Delivers:**
- Complete understand → plan → architect → generate → verify → review → apply loop
- Human gates at plan approval and diff approval
- Full audit trail: intent → plan → changes → verification → review → application
- Agent event streaming via SSE to the frontend console
- Project graph view in the frontend console
- Reports: per-run summary of changes, verification results, and review findings
- OpenAI-compatible LLM provider with automatic fallback to stub

**Verification:** A developer with no prior knowledge of EvoCode can submit an intent, review and approve a plan, review and approve a diff, and see the changes applied to the repository — in under 5 minutes.

---

## Future Increments (Post-MVP)

These are planned but not scheduled:

| Increment | Description |
|---|---|
| 6 | Multi-tenancy and authentication (JWT, RBAC) |
| 7 | Continuous evolution: proactive refactoring and dependency updates |
| 8 | CI/CD integration: trigger pipelines, monitor results |
| 9 | Long-running project memory: agents accumulate knowledge across sessions |
| 10 | Stakeholder intent: non-developers can submit intents directly |
