# ADR-005: Intent-Driven Development as the Core Paradigm

## Status

Accepted

## 实现状态（截至 increment 6）

方向性/范式决策成立：意图驱动开发作为核心范式已部分落地——意图确实是流水线的主输入，understand 先于 generate，architect 先于 code。但 Intent-to-Code Loop 中的若干环节仍为计划。

- ✅ 已建：
  - 意图作为主输入：前端提交意图 → 控制平面 → AI 运行时流水线
  - understand→plan→architect→generate→verify→review 全链路（understand 先建知识图谱并做影响分析；architect 产出设计后再 generate）
  - 每个意图产出结构化结果（taskGraph / changeSet / verification / review）
- 🚧 部分：
  - generate 为确定性模板，写入 `evocode_generated/` 子目录，不改既有文件（最小变更原则以「新增隔离目录」方式近似实现）
- 📋 计划中：
  - 人工审批门（plan / diff approve-reject 的真实交互）——当前前端无审批门 UI
  - apply：将变更提交到仓库 / PR 集成
  - evolve：变更后回写知识图谱新状态
  - 完整审计追踪与版本化变更

## Date

2026-06-28

## Context

Traditional software development is code-driven: developers are the primary authors of implementation code. Tools assist — editors autocomplete, linters catch errors, AI tools suggest completions — but the developer remains the author. The unit of work is a file, a function, a commit.

This model has served the industry well but has fundamental scaling limits. The demand for software outpaces the supply of developers. Requirements expressed in natural language must be translated into code by a human, a process that is slow, error-prone, and expensive. The knowledge required to modify a large system safely lives in the heads of experienced developers, not in the codebase itself.

Intent-driven Development is a new paradigm in which requirements expressed as intent become the primary input to the software development process. Agents translate intent into architecture, implementation, tests, and documentation. Humans review outcomes and make judgment calls at consequential decisions.

The shift is analogous to the shift from assembly to high-level languages: the developer no longer manages the mechanics; they express the goal. The platform translates the goal into correct, verifiable mechanics.

## Decision

EvoCode adopts Intent-driven Development as its core development paradigm.

### Core Properties

**Intent is the primary input.** The developer's artifact is the intent — a natural language or structured description of what the software should do. Implementation code is an output of the platform, not an input.

**Architecture precedes code.** Before any code is generated, the Architect agent evaluates the intent against the existing knowledge graph and produces an architecture plan. Implementation is always grounded in a design decision.

**Understanding precedes modification.** The understand phase runs before any generation phase. Agents never modify code they have not modeled. This prevents the most common class of agent-generated regression: changes that are locally correct but globally inconsistent.

**Changes are minimal and targeted.** The Minimal Change Principle: given an intent, the platform produces the smallest set of changes that satisfies the intent without refactoring unrelated code. This keeps diffs reviewable and limits blast radius.

**Continuous evolution.** Software is never finished. The platform is designed to receive new intents continuously and to evolve software incrementally over time. Each intent results in a versioned change with full audit trail.

**Humans decide.** At every consequential decision — plan approval, code review, change application — a human has the opportunity to approve or reject. The platform does not apply changes to production automatically without a human gate (until the developer explicitly configures trusted automation for specific change categories).

### The Intent-to-Code Loop

```
Intent submitted
  → understand: extract knowledge graph, analyze impact
  → plan: produce TaskGraph of engineering tasks
  → [human approves plan]
  → architect: design decisions per task
  → generate: implement each task
  → verify: run tests, type checking, linting
  → review: automated code review
  → [human approves changes]
  → apply: commit changes to repository
  → evolve: update knowledge graph with new state
```

## Consequences

**Positive:**
- Developers focus on business requirements, not implementation mechanics
- Requirements are traceable: every code change links to an intent
- The platform can accept intents from non-developers (product managers, business analysts)
- Continuous evolution becomes manageable: the platform handles routine maintenance

**Negative:**
- Developers must trust the platform's generated code — a trust that must be earned through demonstrated correctness and transparent review tooling
- The platform cannot handle intent that is too vague or contradictory without clarification
- Some categories of change (performance tuning, security hardening) require architectural judgment that current agents cannot fully automate

**Mitigations:**
- Human review gates at plan and diff stages maintain developer control
- The platform surfaces its reasoning at every step — developers can inspect why a decision was made
- Partial automation is valid: the platform can handle routine features autonomously while surfacing complex decisions for human input

## Alternatives Considered

### AI-Assisted Code Development (Copilot model)

Rejected as the primary paradigm. The Copilot model keeps the developer as the primary author and uses AI as a faster typist. This does not address the fundamental scaling problem and does not produce the architectural grounding that makes large-codebase changes safe.

### Low-Code / No-Code Platform

Rejected. Low-code platforms sacrifice expressiveness for speed. EvoCode targets real production codebases and must support the full expressiveness of React and Spring Boot without constraints.

### Model-Driven Architecture (MDA)

Considered. MDA shares the Intent-driven Development goal of separating specification from implementation. EvoCode differs in that intents are natural language (not formal models), and agents perform the translation dynamically using LLMs rather than template-based code generation. The knowledge graph is EvoCode's analog to the platform-independent model (PIM) in MDA.
