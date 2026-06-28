# Frontend Architecture

> **实现状态（截至 increment 6） / Implementation Status (as of increment 6)**
> 本文档描述的是**目标架构**。当前前端是单页意图提交 + 结果渲染界面。
> - ✅ 已构建：意图提交表单与结果渲染（taskGraph / changeSet / verification / review）— `src/app/page.tsx`；调用 Control Plane `/api/intents` — `src/lib/api.ts`；Next.js 15.5.x（App Router）、TypeScript、React、pnpm。
> - 📋 计划中：审批门（plan/diff approve-reject）、SSE 实时事件、项目图视图、Dashboard、Agent Chat、Code Diff Viewer；路由 `app/projects`、`app/runs`、`hooks/`、`lib/sse.ts`；Tailwind CSS（无依赖）、React Context、Server Components（均未使用）。

## Overview

The EvoCode frontend is a Next.js application that serves as the developer console for the platform. It is the primary interface for submitting intents, reviewing plans, inspecting generated code diffs, and approving or rejecting changes.

The frontend is intentionally thin — it does not contain business logic, agent coordination, or knowledge of the AI Runtime. All state comes from the Control Plane.

---

## Technology Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| UI library | React |
| Styling | Tailwind CSS — 📋 planned (no Tailwind dependency present) |
| State | React Context / Server Components — 📋 planned (not currently used) |
| HTTP client | fetch (native) |
| Package manager | pnpm |
| Port | 3000 |

`package.json` pins Next.js at 15.5.x. Tailwind CSS, React Context, and Server Components describe the target setup and are not currently in use; styling and state are handled with plain CSS and client components today.

---

## Application Sections

### Dashboard

The entry point. Shows active projects, recent runs, and a high-level status of the autonomous engineering activity. Links to individual project views and the intent submission interface.

### Intent Submission

A text input where developers submit natural language intents. The interface optionally accepts a project identifier and repository path. On submission, it opens the planning view for the resulting run.

### Plan Review

Displays the TaskGraph returned by the planner. Shows each task with its kind (frontend, backend, test), title, description, and the estimated impact. Developers approve or reject individual tasks before the platform proceeds to implementation.

### Agent Chat

A conversation log showing the activity of each agent during a run. Each message identifies the agent that produced it, the phase it corresponds to, and any structured data (e.g., a file path, a test result, a lint warning). This view is for observation, not interaction — the primary communication with agents is through intent submission and the review interface.

### Code Diff Viewer

Side-by-side diff view for every file changed by a run. Syntax-highlighted, showing unchanged context lines, additions, and deletions. Links from the diff view to the affected components in the project graph.

### Project Graph

Visual representation of the knowledge graph for a project: components, files, API endpoints, and the import/dependency edges between them. Highlights which nodes were touched by the most recent run and what their impact radius is.

### Review Interface

The approval gate. A developer reviews the complete set of changes — plan, diffs, test results, review agent findings — and approves or rejects. Approval triggers application of the changes. Rejection with a comment re-enters the planning loop.

---

## Component Structure

> **实现状态**：下方结构是**目标布局**。当前实际仅有单页 `src/app/page.tsx` 与 `src/lib/api.ts`（加 `src/types/`）。`app/projects/`、`app/runs/`、`lib/sse.ts`、`hooks/` 以及多数 `components/` 子目录均为 📋 计划中。

```
src/
├── app/                     # Next.js App Router pages
│   ├── page.tsx             # Dashboard
│   ├── projects/[id]/       # Project detail and intent submission
│   ├── runs/[id]/           # Run detail: plan, diff, review
│   └── layout.tsx           # Root layout
├── components/
│   ├── intent/              # Intent input form
│   ├── plan/                # Task graph display
│   ├── diff/                # Code diff viewer
│   ├── graph/               # Project graph visualization
│   ├── chat/                # Agent activity log
│   └── review/              # Approval interface
├── types/                   # TypeScript interfaces aligned with contracts/
├── lib/
│   ├── api.ts               # Control Plane API client
│   └── sse.ts               # Server-Sent Events handler for streaming
└── hooks/                   # Shared React hooks
```

---

## Communication with the Control Plane

> **实现状态**：当前仅 `POST /api/intents` 真实可用。下方其余端点（`GET /api/runs/{id}`、`/stream`、approve/reject、`/api/projects/{id}/graph`）为 📋 计划中，对应 Control Plane 端点也尚未实现。

The frontend communicates with the Spring Boot Control Plane exclusively. It never calls the AI Runtime or Business Services directly.

**POST /api/intents** — submit an intent, receive a run ID  
**GET /api/runs/{id}** — poll run status and results  
**GET /api/runs/{id}/stream** — Server-Sent Events stream for live agent activity  
**POST /api/runs/{id}/approve** — approve a plan or diff  
**POST /api/runs/{id}/reject** — reject with feedback  
**GET /api/projects/{id}/graph** — fetch the knowledge graph for visualization  

All request and response types mirror the schemas in `contracts/`.

---

## Streaming

Agent activity is streamed to the frontend via Server-Sent Events. Each event carries:

```typescript
interface AgentEvent {
  runId: string;
  agentKind: 'planner' | 'architect' | 'frontend' | 'backend' | 'review' | 'test';
  phase: 'understand' | 'plan' | 'generate' | 'verify';
  message: string;
  data?: Record<string, unknown>;
}
```

The frontend renders these events in the Agent Chat view in real time. Events are also persisted server-side so they are available when a developer opens a completed run.

---

## Deployment

The frontend is a standard Next.js application deployable as a Docker container. In local development it runs on port 3000 and proxies `/api` requests to the Control Plane on port 8080 via `next.config.js` rewrites. In production, an API gateway handles routing.
