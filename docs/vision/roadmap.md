# Roadmap

## Overview

EvoCode is delivered in five phases. Each phase builds on the previous and delivers a self-contained increment of autonomous engineering capability. Phases are defined by what a developer can accomplish with the platform at that point, not by internal technical milestones.

---

## Phase 1 — Project Understanding and Planning

**Goal:** The platform can read a codebase and produce a credible engineering plan for any intent.

**Capabilities delivered:**
- TypeScript/React project understanding via AST extraction
- Spring Boot project understanding via bytecode and source analysis
- Knowledge graph construction: components, APIs, imports, dependencies
- Intent parsing and natural language understanding
- Planner agent: converts intent into a structured task graph
- Architect agent: evaluates impact on existing components
- Impact analysis: blast radius estimation for any change
- Plan review interface in the frontend console

**Definition of done:** A developer submits any feature request against a real project and receives a structured engineering plan that correctly identifies which files will change, what new components are needed, and what risks exist.

---

## Phase 2 — Frontend Modifications

**Goal:** The platform can implement frontend changes end-to-end, from intent to committed, tested code.

**Capabilities delivered:**
- Frontend agent: generates React components, pages, hooks, and styles
- Next.js routing and layout awareness
- State management integration (Context, Zustand, or existing pattern)
- Component tree navigation and targeted modification
- Frontend test generation via Test agent
- Code diff viewer in the console
- Review interface with human approval gate

**Definition of done:** A developer submits a frontend feature request and receives a pull request containing new or modified React components, updated routing, and passing tests — without writing a single line of code.

---

## Phase 3 — Backend Modifications

**Goal:** The platform can implement backend changes including new APIs, domain models, and persistence modifications.

**Capabilities delivered:**
- Backend agent: generates Spring Boot controllers, services, repositories, and domain models
- OpenAPI contract generation and validation
- Database migration generation
- Cross-layer consistency: frontend and backend changes coordinated in a single plan
- Backend test generation via Test agent
- Integration test scaffolding

**Definition of done:** A developer submits a full-stack feature request and receives coordinated frontend and backend changes with API contract, domain model, persistence layer, and tests — all in one plan execution.

---

## Phase 4 — Verification and Self-Repair

**Goal:** The platform can verify its own output and repair failures without human intervention for routine cases.

**Capabilities delivered:**
- Automated test execution after code generation
- Failure analysis and root cause identification
- Self-repair loop: agents re-plan and re-generate on failure
- Review agent: automated code quality and correctness review
- Security scanning integration
- Regression detection against baseline

**Definition of done:** The platform executes an intent, encounters a test failure or review rejection, self-repairs without human input, and delivers a passing, reviewed implementation.

---

## Phase 5 — Complete Autonomous Engineering Loop

**Goal:** The platform operates as a fully autonomous engineering team for continuous software evolution.

**Capabilities delivered:**
- Continuous evolution: proactive refactoring, dependency updates, performance improvements
- Multi-intent coordination: parallel execution of independent intents
- Long-running project memory: agents accumulate knowledge about a project across sessions
- Stakeholder intent interface: product managers and business owners can submit intents without developer translation
- Deployment integration: changes flow from intent to production with appropriate gates
- Analytics: velocity, quality, coverage metrics across autonomous and human-initiated changes

**Definition of done:** A team deploys EvoCode against their production codebase and runs for 30 days with measurable reduction in developer time spent on implementation work and no increase in defect rate.

---

## Sequencing Rationale

Phases 1 through 5 are strictly ordered. Each phase depends on the foundation laid by the previous:

- Phase 2 requires Phase 1's project understanding to generate contextually correct code
- Phase 3 requires Phase 2's patterns for code generation and diff review
- Phase 4 requires Phases 2 and 3's generated code to have something to verify
- Phase 5 requires Phase 4's verification loop to be safe enough for autonomous continuous evolution

This ordering is not arbitrary — it reflects the dependency structure of autonomous engineering capability.
