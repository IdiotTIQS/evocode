# Frontend Architecture

> **实现状态（截至 increment 8） / Implementation Status (as of increment 8)**
> 前端已从单页控制台演进为**多路由 Agent Workspace**。本横幅区分「真实后端」「客户端本地持久化」「客户端模拟」三类能力，避免把模拟当作已落地的后端。
>
> - ✅ **已构建（UI + 路由）**：多路由 Agent Workspace —— Dashboard、Projects 列表、Project Tabs（Overview / Sessions / Runs / Graph / Settings）、Session 三栏工作区（左会话史 / 中交互 / 右上下文）、Run 详情页、审批门（Approval Gate）。技术栈：Next.js 15.5.x（App Router，含 `(workspace)` 路由组与 Server Component 重定向）、React 19、TypeScript（strict）、Tailwind CSS、pnpm。
> - ✅ **真实后端 — 两段式审批门**：意图提交后后端**真实中断**于代码生成前，需人工批准两次才落盘 —— `POST /api/intents`（`submitIntent`，跑 understand→plan→architect 后停在 plan gate，返回 `status=waiting_approval`/`gate=plan` + 真实 TaskGraph，磁盘零写入）、`POST /api/runs/{id}/approve`（`approveRun`，第一次 resume 越过 generate 门生成 changeSet 停在 diff gate 仍不落盘；第二次 resume 越过 apply 门落盘并 completed）、`GET /api/runs/{id}`（`getRun`）。底层为 LangGraph `interrupt_before=["generate","apply"]` + checkpointer。所有审批暂停均为**后端真实状态**，兑现「绝不在提交意图后立即执行代码变更」。
> - 🟡 **客户端本地持久化（localStorage，待后端）**：Project 与 Session 实体及其消息历史保存在浏览器 `localStorage`（`src/lib/stores/`，含 `typeof window` SSR 守卫）。刷新保留，但不跨设备、无后端 CRUD。`// TODO(backend)`：接入 Project/Session API 后只换 store 适配器。
> - 🟡 **阶段进度文案（待 SSE 细化）**：planning/coding/reviewing 的文案由真实请求的「在途/完成」驱动（非定时器模拟），但仍是单次 approve 往返粒度，非逐节点实时推送。`// TODO(backend)`：接入逐节点 SSE 流后细化为实时阶段事件。另：待批准 checkpoint 当前由运行时 MemorySaver 持有（进程重启丢失），`// TODO(backend)`：换持久化 checkpointer。
> - 📋 **计划中**：知识图谱可视化（Project Graph，目前为占位页）、多租户 Org（类型已留位，当前隐式单租户）。

## Overview

The EvoCode frontend is a Next.js application that serves as the **Agent Workspace** for the platform. It is the primary interface for managing projects and sessions, submitting intents, reviewing plans, inspecting generated code diffs, and approving or rejecting changes through an approval gate.

The frontend is intentionally thin on backend logic — agent coordination and runtime knowledge live server-side. Run execution state comes from the Control Plane; Project/Session organization is currently persisted client-side in `localStorage` pending backend APIs.

The legacy single-page `/console` has been retired and now redirects to `/dashboard` (Server Component `redirect`). Its reusable building blocks (`PipelineStepper`, `ResultTabs`, `ReviewPanel`) are kept and reused by the new workspace pages.

---

## Technology Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| UI library | React 19 |
| Styling | Tailwind CSS |
| State | Client components + `localStorage` stores (`src/lib/stores/`); pure-TS state machine (`src/lib/execution/`) |
| HTTP client | fetch (native) |
| Package manager | pnpm |
| Port | 3000 |

`package.json` pins Next.js at 15.5.x. Tailwind CSS is in use. There is no global React Context store today — cross-page state for Project/Session is held in `localStorage`-backed stores read inside client components/effects; run execution is orchestrated by a pure-function state machine driven by the `useExecution` hook.

---

## Route Map

> **实现状态**：下表为**实际已构建路由**。工作区路由集中在 `(workspace)` 路由组下（路由组不影响 URL，仅共享 layout/sidebar）。

| Route | Page | Status |
|---|---|---|
| `/` | 落地页（marketing） | ✅ 真实，CTA/导航指向 `/dashboard` |
| `/console` | → 重定向到 `/dashboard`（Server Component `redirect`） | ✅ 收口，旧单页不再渲染 |
| `/dashboard` | Dashboard：最近 Projects / Sessions / Runs + 健康概览 | ✅ UI（数据来自本地 store + 真实 Run） |
| `/projects` | Projects 列表 | ✅ UI（🟡 本地持久化） |
| `/projects/[projectId]` | → 重定向到该项目 `…/overview` | ✅ 收口 |
| `/projects/[projectId]/overview` | 项目概览 | ✅ UI |
| `/projects/[projectId]/sessions` | 项目下会话列表 | ✅ UI（🟡 本地持久化） |
| `/projects/[projectId]/runs` | 项目下运行列表 | ✅ UI |
| `/projects/[projectId]/graph` | 知识图谱 | 📋 占位页（计划中） |
| `/projects/[projectId]/settings` | 项目设置 | ✅ UI（🟡 本地持久化） |
| `/sessions/[sessionId]` | Session 三栏工作区（会话史 / 交互 / 上下文 + 审批门） | ✅ UI（🟡 本地会话 / ✅ 真实两段式审批门后端） |
| `/runs/[runId]` | Run 详情：pipeline / 结果 tabs（timeline·logs·files·verify·review） | ✅ UI + ✅ 真实 `GET /api/runs/{id}` |
| `/settings` | 全局设置 | ✅ UI |

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

> **实现状态**：下方为**实际目录结构**。`console/` 子目录保留为**复用件**（被新 workspace 页面复用），而非旧单页本身——旧 `/console` 路由已收口为重定向。

```
src/
├── app/
│   ├── page.tsx                       # 落地页（marketing）
│   ├── layout.tsx                     # 根 layout
│   ├── console/
│   │   ├── page.tsx                   # redirect("/dashboard")（Server Component）
│   │   └── layout.tsx                 # 最小直通（不再套 ConsoleShell）
│   └── (workspace)/                   # 工作区路由组（共享 WorkspaceShell + GlobalSidebar）
│       ├── dashboard/page.tsx
│       ├── projects/page.tsx
│       ├── projects/[projectId]/      # page(→overview) + overview/sessions/runs/graph/settings
│       ├── sessions/[sessionId]/page.tsx
│       ├── runs/[runId]/page.tsx
│       └── settings/page.tsx
├── components/
│   ├── workspace/                     # GlobalSidebar, WorkspaceShell, StatCard, RecentList
│   ├── session/                       # SessionConversation, SessionCenter,
│   │                                  #   ProjectContextPanel, ApprovalGate
│   ├── console/                       # 保留的复用件：PipelineStepper,
│   │                                  #   ResultTabs, ReviewPanel
│   │                                  #   （ConsoleShell/ConsoleSidebar 为旧单页遗留，已不接路由）
│   ├── ui/                            # shadcn 基础件
│   └── SiteNav / Hero / CTA / …       # 落地页区块（CTA 已指向 /dashboard）
├── lib/
│   ├── api.ts                         # Control Plane 客户端（submitIntent / approveRun / getRun）
│   ├── stores/                        # 🟡 localStorage 持久化：storage.ts（SSR 守卫）,
│   │                                  #   projectStore.ts, sessionStore.ts
│   └── execution/                     # ✅ 审批门状态机：executionMachine.ts（纯 TS）,
│                                      #   useExecution.ts（驱动真实后端两段式端点）
└── types/
    ├── domain.ts                      # 领域模型：Org/Project/Session/SessionMessage/
    │                                  #   ExecutionState(8 态)/RunResult/RunSummary
    └── intent.ts                      # 意图/运行结果契约（对齐 contracts/）
```

`session/ApprovalGate` 与 `lib/execution/` 共同实现审批门：plan gate 与 diff gate 均为**后端真实中断**（LangGraph `interrupt_before`），批准前磁盘零写入；`submitIntent` 返回真实 TaskGraph，`approveRun` 两次往返依次返回真实 changeSet 与最终 verification / review（见上方实现状态横幅）。

---

## Communication with the Control Plane

> **实现状态**：`POST /api/intents`（提交意图，跑到 plan gate 真实中断）、`POST /api/runs/{id}/approve`（批准当前门并 resume）、`GET /api/runs/{id}`（拉取运行状态/结果）**真实可用**。下方 `/stream`（SSE）、`/reject`、`/api/projects/{id}/graph` 为 📋 计划中——后端对应端点尚未实现；当前「拒绝」在前端重置会话（后端批准前未落盘，无需回滚），阶段进度为单次 approve 往返粒度（见顶部实现状态横幅）。

The frontend communicates with the Spring Boot Control Plane exclusively. It never calls the AI Runtime or Business Services directly.

**POST /api/intents** — submit an intent; backend runs understand→plan→architect then interrupts before code generation, returning `waiting_approval`/`gate=plan` + the TaskGraph (no files written) ✅  
**POST /api/runs/{id}/approve** — approve the current gate and resume: plan gate → generates changeSet, stops at diff gate (still no files written); diff gate → applies to disk and completes ✅  
**GET /api/runs/{id}** — poll run status and results ✅  
**GET /api/runs/{id}/stream** — Server-Sent Events stream for live agent activity 📋  
**POST /api/runs/{id}/reject** — reject with feedback 📋  
**GET /api/projects/{id}/graph** — fetch the knowledge graph for visualization 📋  

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
