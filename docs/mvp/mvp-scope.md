# MVP Scope

## 实现状态 (Implementation Status)

> 本节对照 `.superpowers/sdd/doc-status-baseline.md` 标注真实状态。图例：✅ 已构建 / 🚧 部分 / 📋 计划中。下方蓝图（"What the MVP Covers"等）为目标范围，保留原文不删。

当前已跑通的是**最小端到端闭环**：understand → plan → architect → generate → verify → review，仅针对 React/Next.js。Spring Boot 全栈、PR、CI/CD 等仍为计划中。

**Supported Stacks（实际）**
- ✅ React / Next.js：理解 + 确定性模板生成 + `tsc --noEmit` 校验
- 📋 Spring Boot / Java：抽取与代码生成均未实现
- 📋 PostgreSQL schema 分析 / migration 生成：未实现

**Feature Scope（实际）**
- ✅ Project Understanding：React/Next.js 结构抽取、IMPORTS 边、影响分析、按指纹缓存到 SQLite。🚧 跨会话持久化仅 SQLite（非 PostgreSQL）。📋 Spring Boot 抽取、RENDERS / CALLS 边。
- ✅ Plan Generation：解析意图产出 TaskGraph。📋 计划评审 / 逐任务批准（审批门）。
- 🚧 Frontend Code Generation：确定性模板写入 `evocode_generated/` 子目录；不修改既有文件，非真实 LLM 生成代码内容。
- 📋 Backend Code Generation（Spring Boot controllers / services / JPA / migration）：未实现。
- 📋 Test Generation（Jest/RTL、JUnit）：未实现。
- ✅ Verification：只读 TS 类型检查（`tsc --noEmit`）。📋 `mvn test`、ESLint。
- ✅ Code Review：确定性裁定 approve / request_changes / block，结构化 findings。
- 📋 Change Application：写回仓库 / 创建 commit / 审计追踪 / 记录到知识图谱。

**Out of Scope（与现状一致）**：鉴权与多租户、持续演进、PR 创建、CI/CD、其他技术栈等均确为未实现。

---

## What the MVP Covers

The EvoCode MVP demonstrates the complete intent-to-code loop for two technology stacks: React/Next.js (frontend) and Spring Boot (backend). A developer submits a natural language feature request against a real codebase and receives generated, verified, reviewed code ready for approval.

This is not a prototype. The MVP is the foundation of the production platform. Every architectural decision, agent interface, and data model introduced in the MVP is designed for longevity.

---

## Supported Technology Stacks

| Stack | Version | Support Level |
|---|---|---|
| React | 18+ | Full (components, hooks, state) |
| Next.js | 13+ (App Router) | Full (pages, layouts, API routes) |
| Next.js | 12 (Pages Router) | Best-effort |
| Spring Boot | 3.x | Full (controllers, services, repositories, JPA) |
| Spring Boot | 2.7 | Best-effort |
| TypeScript | 5.x | Required for React/Next.js projects |
| Java | 21 | Required for Spring Boot projects |
| PostgreSQL | 14+ | Full (schema analysis, migration generation) |

---

## Feature Scope

### Project Understanding

- Extract React/Next.js project structure: components, pages, hooks, types, imports
- Extract Spring Boot project structure: controllers, services, repositories, entities, DTOs
- Build knowledge graph with IMPORTS, RENDERS, CALLS edges
- Compute dependency and impact sets for all nodes
- Cache graph by repository fingerprint
- Persist graph across sessions (SQLite → PostgreSQL)

### Engineering Plan Generation

- Parse natural language intent
- Produce a TaskGraph of frontend, backend, and test tasks
- Annotate tasks with affected files and estimated impact
- Present plan to developer for review and approval
- Allow developer to reject individual tasks or the whole plan

### Frontend Code Generation

- Generate new React components following project conventions
- Modify existing React components with targeted changes
- Create new Next.js pages (App Router and Pages Router)
- Update navigation when new pages are added
- Generate TypeScript prop interfaces and types

### Backend Code Generation

- Generate new Spring Boot REST controllers
- Generate service layer classes and interfaces
- Generate JPA repositories
- Generate JPA entities and DTOs
- Generate Flyway or Liquibase migration scripts

### Test Generation

- Generate Jest + React Testing Library tests for React components
- Generate JUnit 5 + Spring Boot Test (`@WebMvcTest`) tests for controllers
- Generate JUnit 5 unit tests for service classes

### Verification

- Run TypeScript type checker (`tsc --noEmit`) against generated frontend changes
- Run Maven compile and test (`mvn test`) against generated backend changes
- Run ESLint against generated frontend changes
- Surface verification results in the frontend console

### Code Review

- Automated review by the Review Agent
- Structured findings with severity, location, and suggested fix
- Review verdict: approve, request changes, or block
- Review summary displayed in the frontend console before developer approval

### Change Application

- Present complete diff to developer
- Apply approved changes to the repository (write files, create commit)
- Record change in the knowledge graph
- Associate change with the originating intent in the audit trail

---

## Out of Scope for MVP

The following are explicitly excluded from the MVP:

- Authentication and multi-tenancy (MVP is single-user, localhost-only)
- Continuous evolution and proactive refactoring
- Pull request creation (MVP writes to the local filesystem; PR creation is Phase 3)
- CI/CD integration
- Vue, Angular, Django, Rails, or any stack not listed above
- Performance analysis and optimization suggestions
- Dependency update automation
- Infrastructure and deployment code generation

---

## Success Criteria

The MVP is successful when:

1. A developer can submit a feature request against a real React/Next.js + Spring Boot project
2. The platform produces a correct, passing, review-approved implementation
3. The implementation matches the project's existing naming conventions and code style
4. The total time from intent submission to approved diff is under 5 minutes for a typical single-endpoint feature
5. The developer does not need to manually fix any generated code for the happy path
