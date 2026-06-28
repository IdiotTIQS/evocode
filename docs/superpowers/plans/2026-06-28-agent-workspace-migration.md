# EvoCode 前端演进：Agent Engineering Workspace 迁移计划

> **For agentic workers:** 用 superpowers:subagent-driven-development 逐任务执行。步骤用 `- [ ]` 跟踪。

**目标：** 把当前"单页 demo 控制台"（`/console`）演进为生产级的 Agent Engineering Workspace——以 Organization→Project→Session→Run 领域模型为骨架，多路由、基于 URL 的资源层级、审批门、实时执行可见性。不重新设计产品，是演进现有实现。

**架构：** 引入**领域数据层 + 数据源适配器（seam）**。后端目前只有 `POST /api/intents`（同步跑完整流水线返回 RunResult）、`GET /api/runs`、`GET /api/runs/{id}`，**没有** Project/Session 实体、没有审批拆分、没有流式。因此：
- Run 走真实 API（`@/lib/api`）。
- Project/Session 用**客户端持久化适配器**（localStorage 实现 `ProjectStore`/`SessionStore`，接口与未来后端对齐），明确标注为 client-side、待后端落地后替换。
- 审批门与实时状态用**客户端编排 + 进度模拟**：因为后端是一把梭同步返回，前端把"提交意图→规划→等待审批→生成→审查"做成 UI 状态机，在 `waiting_approval` 处真实暂停等用户点批准；底层调用仍是单次 `submitIntent`（在批准后触发），进度状态用客户端流式模拟（`ExecutionStream` 抽象，未来换成 SSE）。**每个模拟点都标注 `// TODO(backend): replace with real SSE/staged API`。**

**技术栈：** Next.js 15 App Router（嵌套 layout + 动态路由）、React 19、Tailwind v4 + shadcn/ui（沿用现有 token 与组件）、lucide。无新运行时依赖（数据层用 localStorage + 原生 fetch）。

## Global Constraints

- **不破坏现有可用能力**：落地页 `/` 不动；现有真实 Run 调用（submitIntent/listRuns/getRun）语义不变；现有 shadcn token 体系与组件不回退。
- **复用优先**：IntentForm/PipelineStepper/ResultTabs/ReviewPanel/RunHistory 尽量复用或小改，不重写。
- **诚实边界**：凡是后端尚不支持的（Project/Session 持久化、审批拆分、SSE、apply changes），一律用清晰命名的适配器/模拟实现，并在代码注释标 `TODO(backend)`。绝不把模拟伪装成真实后端能力。UI 上对"模拟/本地"状态给出诚实标识（如 Session/Project 标注"本地"）。
- **类型先行**：领域类型（Organization/Project/Session/Run/ExecutionState）集中在 `src/types/domain.ts`，所有适配器与组件依赖它。
- **URL 即状态**：资源层级走路由参数（projectId/sessionId/runId），刷新/分享 URL 保留上下文。
- **必须编译**：每个任务 `npx tsc --noEmit`，关键任务 `npx next build`，均须通过。
- **无障碍底线**：键盘可达、focus 可见、`prefers-reduced-motion`、单一 main landmark/页。
- **中文 UI 文案**，sentence case，动词式按钮（遵循 frontend-design 写作原则）。
- **执行状态机枚举**（贯穿全程，唯一真相）：`queued | planning | waiting_approval | coding | testing | reviewing | completed | failed`。

---

## 阶段与任务总览

- **Phase A 地基**（T1 领域类型 + 数据源适配器；T2 Workspace 外壳/导航/路由骨架）
- **Phase B 资源页**（T3 Dashboard；T4 Projects 列表 + Project 详情 Tabs；T5 Run 详情页）
- **Phase C 核心**（T6 Session Workspace 三栏布局；T7 审批门状态机 + 进度流模拟）
- **Phase D 收尾**（T8 旧 /console 迁移重定向 + 架构文档）

---

### Task 1: 领域类型 + 数据源适配器（seam）

**Files:**
- Create: `frontend/src/types/domain.ts`
- Create: `frontend/src/lib/stores/projectStore.ts`
- Create: `frontend/src/lib/stores/sessionStore.ts`
- Create: `frontend/src/lib/stores/storage.ts`（localStorage 安全封装，SSR 守卫）
- Test 替代：本任务无单测框架，靠 `npx tsc --noEmit` 保证类型正确 + 后续页面集成验证。

**Interfaces:**
- Produces:
  - `domain.ts`：
    ```ts
    export type ExecutionState = "queued"|"planning"|"waiting_approval"|"coding"|"testing"|"reviewing"|"completed"|"failed";
    export interface Project { id: string; name: string; repoPath?: string; createdAt: string; }
    export interface Session { id: string; projectId: string; title: string; createdAt: string; updatedAt: string; }
    export interface SessionMessage { id: string; sessionId: string; role: "user"|"agent"; kind: "intent"|"status"|"result"; text: string; runId?: string; createdAt: string; }
    // Run 复用现有 RunResult/RunSummary（@/types/intent）
    ```
  - `storage.ts`：`getItem<T>(key, fallback): T`、`setItem(key, val)`，SSR 安全（`typeof window === "undefined"` 返回 fallback）。
  - `projectStore.ts`：`listProjects(): Project[]`、`getProject(id): Project|null`、`createProject(name, repoPath?): Project`、`deleteProject(id): void`。基于 localStorage（key `evocode.projects`）。每个公共函数顶部注释 `// TODO(backend): 后端 Project API 落地后替换为 fetch`。
  - `sessionStore.ts`：`listSessions(projectId?): Session[]`、`getSession(id): Session|null`、`createSession(projectId, title): Session`、`appendMessage(sessionId, msg): void`、`getMessages(sessionId): SessionMessage[]`、`touchSession(id): void`（更新 updatedAt）。localStorage（key `evocode.sessions` / `evocode.messages`）。同样标 TODO(backend)。

- [ ] **Step 1: 写 storage.ts（SSR 安全 localStorage 封装）**

```ts
// frontend/src/lib/stores/storage.ts
// 客户端持久化封装。SSR 期返回 fallback，避免 window 未定义崩溃。
// TODO(backend): 这些数据未来由后端持久化；此封装仅用于 Project/Session 的本地存储过渡。
export function getItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setItem(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 配额满或隐私模式：静默降级 */
  }
}
```

- [ ] **Step 2: 写 domain.ts（领域类型）**

按上面 Interfaces 的类型定义写入，并 `import type { RunResult, RunSummary } from "@/types/intent"` 后 `export type { RunResult, RunSummary }`（统一从 domain 出口，方便后续迁移）。加 `export const EXECUTION_STATES` 数组常量列出 8 个状态，供 UI 遍历。

- [ ] **Step 3: 写 projectStore.ts**

实现 list/get/create/delete。`createProject` 用 `crypto.randomUUID()` 生成 id（SSR 守卫：仅客户端调用），`createdAt = new Date().toISOString()`。每个导出函数顶部标 `// TODO(backend)`。

- [ ] **Step 4: 写 sessionStore.ts**

实现 list/get/create/appendMessage/getMessages/touchSession。message id 用 randomUUID。`createSession` 设 createdAt=updatedAt。`appendMessage` 同时 `touchSession`。标 TODO(backend)。

- [ ] **Step 5: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/domain.ts frontend/src/lib/stores
git commit -m "feat(frontend): 领域类型 + Project/Session 本地数据源适配器（seam, TODO backend）"
```

---

### Task 2: Workspace 外壳 + 全局导航 + 路由骨架

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceShell.tsx`
- Create: `frontend/src/components/workspace/GlobalSidebar.tsx`
- Create: `frontend/src/app/(workspace)/layout.tsx`（路由组，套 WorkspaceShell + Toaster）
- Create: 占位页 `frontend/src/app/(workspace)/dashboard/page.tsx`、`projects/page.tsx`、`settings/page.tsx`（最小占位，后续任务填充）
- Modify: 无（旧 /console 保留到 T8）

**Interfaces:**
- Consumes: shadcn 组件、lucide、`next/link`、`next/navigation` 的 `usePathname`。
- Produces:
  - `GlobalSidebar`：固定左栏。品牌（渐变 logo+EvoCode 链 `/dashboard`）；导航用 **`next/link`**（不再死链）：Dashboard(`/dashboard`,LayoutDashboard)、Projects(`/projects`,FolderGit2)、Settings(`/settings`,Settings)；active 态用 `usePathname` 前缀匹配高亮；底部"返回首页"→`/`。移动端：`<md` 顶部横向条（沿用现有 ConsoleSidebar 的响应式做法）。
  - `WorkspaceShell`：`flex` 布局，左 GlobalSidebar + 右主区（顶栏含面包屑占位 slot + 主内容 `max-w-6xl`）。接受可选 `header` slot。
  - `(workspace)/layout.tsx`：`<WorkspaceShell>{children}</WorkspaceShell>` + `<Toaster/>`。
  - 三个占位页：各渲染一个标题 + "建设中"提示，确保路由可达、build 通过。

- [ ] **Step 1: 写 GlobalSidebar**（参考现有 `ConsoleSidebar.tsx` 的结构与响应式类，改用 next/link + usePathname active）

- [ ] **Step 2: 写 WorkspaceShell**（参考现有 `ConsoleShell.tsx`，主区留面包屑 slot + children）

- [ ] **Step 3: 写 (workspace)/layout.tsx**（套 shell + Toaster；注意 `"use client"` 仅 GlobalSidebar 需要，layout 可 server，但若用 usePathname 则 GlobalSidebar 标 client）

- [ ] **Step 4: 写 dashboard/projects/settings 三个占位 page**

每个：`export default function X(){ return <div className="space-y-2"><h1 className="text-2xl font-semibold">标题</h1><p className="text-muted-foreground">建设中。</p></div>; }`

- [ ] **Step 5: 验证编译 + 构建**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Expected: 通过，`/dashboard`、`/projects`、`/settings` 生成；`/`、`/console` 不回退。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workspace "frontend/src/app/(workspace)"
git commit -m "feat(frontend): Workspace 外壳 + 全局导航（next/link 活跃态）+ 路由骨架"
```

---

### Task 3: Dashboard

**Files:**
- Modify: `frontend/src/app/(workspace)/dashboard/page.tsx`
- Create: `frontend/src/components/workspace/StatCard.tsx`（小数字卡，复用）
- Create: `frontend/src/components/workspace/RecentList.tsx`（通用最近列表）

**Interfaces:**
- Consumes: `listProjects`、`listSessions`、`listRuns`（真实 API）、shadcn Card/Badge、lucide、next/link。
- Produces: Dashboard 渲染四块——recent projects（取 projectStore，链 `/projects/[id]`）、recent sessions（sessionStore，链 `/sessions/[id]`）、recent runs（listRuns，链 `/runs/[id]`）、agent health（静态：6 节点流水线在线状态——诚实标注"基于最近一次运行/静态健康"）。`"use client"`，挂载时拉数据，空态有引导（"还没有项目，去创建一个"）。

- [ ] **Step 1: 写 StatCard + RecentList 通用组件**
- [ ] **Step 2: 写 Dashboard 页**（四区块，真实 listRuns + 本地 projects/sessions，空态引导）
- [ ] **Step 3: 验证编译**：`npx tsc --noEmit`
- [ ] **Step 4: Commit** `feat(frontend): Dashboard（最近项目/会话/运行 + 健康）`

---

### Task 4: Projects 列表 + Project 详情（Tabs）

**Files:**
- Modify: `frontend/src/app/(workspace)/projects/page.tsx`（列表 + 新建）
- Create: `frontend/src/app/(workspace)/projects/[projectId]/layout.tsx`（项目级 Tabs 导航）
- Create: `.../[projectId]/overview/page.tsx`、`sessions/page.tsx`、`runs/page.tsx`、`settings/page.tsx`
- Create: `.../[projectId]/page.tsx`（重定向到 overview）
- Create: `frontend/src/components/project/CreateProjectDialog.tsx`（无 shadcn dialog 则用受控简单弹层/内联表单）

**Interfaces:**
- Consumes: projectStore、sessionStore、listRuns、next/navigation（`useParams`/`useRouter`）。
- Produces:
  - `/projects`：项目卡片网格 + "新建项目"（名称 + 可选 repoPath → `createProject` → 跳 `/projects/[id]/overview`）。空态引导。
  - `/projects/[projectId]/layout.tsx`：顶部项目名 + Tabs（Overview/Sessions/Runs/Graph/Settings，用 next/link + usePathname active），children 渲染各 tab。Graph 暂为占位（知识图谱可视化是后续，诚实标"计划中"）。
  - overview：项目元信息（repoPath/createdAt）+ 计数（sessions/runs）。
  - sessions：该项目的 session 列表（sessionStore.list(projectId)）+ "新建会话"→ createSession → 跳 `/sessions/[id]`。
  - runs：该项目的 runs（listRuns 后按 projectId 过滤——注：RunSummary 有 projectId 字段）。
  - settings：项目名/repoPath 编辑（写回 projectStore）+ 删除项目（确认）。
  - graph：占位卡片，标注"知识图谱可视化：计划中"。

- [ ] **Step 1: 写 CreateProjectDialog（或内联新建表单）**
- [ ] **Step 2: 写 /projects 列表页**
- [ ] **Step 3: 写 [projectId]/layout.tsx（Tabs 导航）+ page.tsx（redirect overview）**
- [ ] **Step 4: 写 overview/sessions/runs/settings/graph 五个 tab 页**
- [ ] **Step 5: 验证编译 + build**：`npx tsc --noEmit && npx next build`
- [ ] **Step 6: Commit** `feat(frontend): Projects 列表 + Project 详情 Tabs（overview/sessions/runs/graph/settings）`

---

### Task 5: Run 详情页

**Files:**
- Create: `frontend/src/app/(workspace)/runs/[runId]/page.tsx`
- 复用: `ResultTabs`、`PipelineStepper`、`ReviewPanel`（现有）

**Interfaces:**
- Consumes: `getRun(runId)`（真实 API）、复用现有结果组件。
- Produces: Run 详情页——按 runId 拉 `getRun`，渲染 PipelineStepper（done 态）+ ResultTabs（含 timeline/logs/files/verify/review）。404/加载/错误态。把现有"结果区"逻辑搬到这个独立路由（URL 可分享刷新保留）。

- [ ] **Step 1: 写 runs/[runId]/page.tsx**（"use client"，useParams 取 runId，getRun，loading/error/notfound 三态，复用 ResultTabs+PipelineStepper）
- [ ] **Step 2: 验证编译 + build**
- [ ] **Step 3: Commit** `feat(frontend): Run 详情独立路由 /runs/[runId]（复用 ResultTabs/PipelineStepper）`

---

### Task 6: Session Workspace 三栏布局（最重要）

**Files:**
- Create: `frontend/src/app/(workspace)/sessions/[sessionId]/page.tsx`
- Create: `frontend/src/components/session/SessionConversation.tsx`（左：消息历史）
- Create: `frontend/src/components/session/SessionCenter.tsx`（中：意图输入+计划+时间线+diff+审查）
- Create: `frontend/src/components/session/ProjectContextPanel.tsx`（右：项目上下文+agent 活动）
- 复用: IntentForm（小改为 session 内嵌）、PipelineStepper、ResultTabs、ReviewPanel

**Interfaces:**
- Consumes: sessionStore（getSession/getMessages/appendMessage）、projectStore（getProject）、Task 7 的执行编排 hook（先留接口，T6 用占位 onSubmit，T7 接真实状态机）。
- Produces: 三栏响应式布局：
  - 左（`w-64`，`<lg` 折叠成抽屉/顶部）：当前 session 的消息历史（user intent / agent status / result 链到 run）+ 同项目其它 session 切换列表。
  - 中（`flex-1`，主交互区）：顶部当前 session 标题；意图输入（复用 IntentForm 精简版，去掉 projectId/repoPath——这些来自 session 所属 project）；提交后区域显示 PipelineStepper + 计划/时间线/diff/审查占位（T7 填充状态机）。
  - 右（`w-72`，`<xl` 隐藏）：项目上下文（项目名/repoPath/graphStats 若有）+ agent 活动流占位。
  - 用户大部分时间待在这里。
- 本任务先把三栏布局 + 数据接线 + 消息持久化做出来；执行用占位（提交意图 → appendMessage 记录 → 调一次现有 submitIntent → 结果 appendMessage）。审批门与流式留给 T7。

- [ ] **Step 1: 写 SessionConversation（左栏：消息列表 + session 切换）**
- [ ] **Step 2: 写 ProjectContextPanel（右栏：项目信息 + 活动占位）**
- [ ] **Step 3: 写 SessionCenter（中栏：意图输入 + 结果区，先用直接 submitIntent 占位编排）**
- [ ] **Step 4: 写 sessions/[sessionId]/page.tsx（三栏组装；getSession 不存在→友好提示/回 projects）**
- [ ] **Step 5: 验证编译 + build**
- [ ] **Step 6: Commit** `feat(frontend): Session Workspace 三栏布局（会话历史/中央交互/项目上下文）`

---

### Task 7: 审批门状态机 + 执行进度流（模拟）

**Files:**
- Create: `frontend/src/lib/execution/executionMachine.ts`（状态机 + 进度模拟）
- Create: `frontend/src/lib/execution/useExecution.ts`（React hook 封装）
- Modify: `frontend/src/components/session/SessionCenter.tsx`（接入状态机 + 审批 UI）
- Create: `frontend/src/components/session/ApprovalGate.tsx`（计划审批 / diff 审批面板）

**Interfaces:**
- Produces:
  - `executionMachine`：管理 `ExecutionState` 流转 `queued→planning→waiting_approval→coding→testing→reviewing→completed`。**关键诚实点**：后端是一把梭，所以编排这样做——
    1. 提交意图 → 状态 `planning`（客户端模拟短延迟 + 进度文案）。
    2. → `waiting_approval`：此处**真实暂停**，UI 显示"计划待审批"（计划内容：用现有 stub 规划逻辑或一次轻量预览；若后端无独立 plan 端点，则展示"将要执行的意图摘要"并要求用户确认）。`// TODO(backend): 接入独立 /plan 端点返回 TaskGraph 供审批`。
    3. 用户点"批准计划" → `coding`/`testing`/`reviewing`（客户端模拟阶段推进，文案对应）→ 实际在批准后调用真实 `submitIntent`（它会同步跑完整流水线）。
    4. 拿到 RunResult → 进入"diff 审批"：展示 changeSet，用户"批准应用"（`// TODO(backend): apply changes 端点；当前生成物已写入 evocode_generated/，此处为确认动作`）。
    5. → `completed`。失败 → `failed`。
    - 进度推进用 `ExecutionStream` 抽象（setInterval/Promise 模拟逐状态），命名与注释明确标 `// TODO(backend): replace with SSE stream from /api/runs/{id}/stream`。
  - `useExecution(session)`：返回 `{ state, plan, result, submitIntent(text), approvePlan(), approveDiff(), error }`。
  - `ApprovalGate`：根据 state 渲染计划审批或 diff 审批的批准/拒绝按钮 + 内容。
- **绝不在提交意图后立即执行代码变更**——批准前不调 submitIntent。

- [ ] **Step 1: 写 executionMachine（纯 TS 状态机 + 模拟推进，含 TODO(backend) 注释）**
- [ ] **Step 2: 写 useExecution hook**
- [ ] **Step 3: 写 ApprovalGate（计划/diff 两种审批 UI）**
- [ ] **Step 4: 改 SessionCenter 接入 useExecution + PipelineStepper 映射 ExecutionState + ApprovalGate + 结果**
- [ ] **Step 5: 验证编译 + build**
- [ ] **Step 6: 浏览器 QA（无需后端可走到 waiting_approval；有后端可验证批准后真实 run）**
- [ ] **Step 7: Commit** `feat(frontend): 审批门状态机 + 执行进度流模拟（waiting_approval 真实暂停, TODO backend SSE）`

---

### Task 8: 旧 /console 迁移 + 架构文档

**Files:**
- Modify: `frontend/src/app/console/page.tsx`（改为重定向到 `/dashboard`，或保留为"经典视图"并加迁移提示）
- Modify: `frontend/src/components/SiteNav.tsx`、落地页 CTA（"打开控制台"指向 `/dashboard`）
- Modify: `docs/architecture/frontend-architecture.md`（更新实现状态 + 新架构）
- 可选清理：旧 `console/` 组件若已被 workspace 取代则保留标注或移除（最小破坏：保留，标注 deprecated）

**Interfaces:** 文档 + 入口收口，无新功能。

- [ ] **Step 1: /console → redirect /dashboard**（用 `redirect("/dashboard")` server 组件，或保留经典页加顶部提示链到新工作区）
- [ ] **Step 2: 落地页/导航的"打开控制台"指向 /dashboard**
- [ ] **Step 3: 更新 frontend-architecture.md**：实现状态改为"已建：Dashboard/Projects/Project Tabs/Session Workspace/Run 详情/审批门(模拟)"；明确标注 Project/Session 为本地持久化、审批门与流式为客户端模拟待后端；给出新路由表与组件结构。
- [ ] **Step 4: 验证编译 + build**（全路由生成）
- [ ] **Step 5: Commit** `refactor(frontend): /console 收口到 /dashboard；更新前端架构文档`

---

## Self-Review

**1. 覆盖（对照 spec 必需项）：**
- 领域模型 Org→Project→Session→Run → T1 类型 + T4/T6 实现。✓（Org 当前隐式单租户，类型留位）
- 路由架构 /dashboard、/projects、/projects/[id]/{overview,sessions,runs,settings}、/sessions/[id]、/runs/[id]、/settings → T2/T3/T4/T5/T6。✓（spec 列了 /projects/[id]/graph 之外的 settings/graph，T4 含 graph 占位）
- Dashboard（recent projects/sessions/runs + health）→ T3。✓
- Project Tabs（Overview/Sessions/Runs/Graph/Settings）→ T4。✓
- Session Workspace 三栏（左会话史/中交互/右上下文）→ T6（最重要，单列任务）。✓
- Run 页（timeline/logs/files/verify/review）→ T5 复用 ResultTabs。✓
- 审批门（intent→plan→review→approve→code→diff→approve→apply，绝不立即执行）→ T7。✓
- 实时状态机 8 态 + 流式 → T7（模拟，TODO backend SSE）。✓
- 复用现有组件 → IntentForm/PipelineStepper/ResultTabs/ReviewPanel/RunHistory 在 T3/T5/T6/T7 复用。✓
- 多路由拆分、领域目录结构、可扩展、最小破坏 → 全程；旧 /console 保留到 T8 收口。✓

**2. 占位扫描：** 真实后端缺口处统一用命名适配器 + `TODO(backend)` 注释，UI 诚实标注"本地/模拟/计划中"。无 TBD 式空洞占位。

**3. 类型一致：** `ExecutionState` 8 态枚举在 domain.ts 定义，T7 状态机与 PipelineStepper 映射共用。Project/Session/SessionMessage 字段在 T1 定下，T4/T6 消费一致。Run 复用 RunResult/RunSummary 不改契约。

**4. 风险点：**
- 后端能力缺口大——已用 seam + 模拟 + TODO(backend) 诚实隔离；未来后端落地时只换适配器实现，UI/路由不动。
- localStorage SSR——storage.ts 有 `typeof window` 守卫；所有 store 调用在 client 组件/effect 内。
- 路由组 `(workspace)` 不影响 URL 路径，仅共享 layout。
- 最小破坏：落地页与现有 Run API 全程不动；旧 /console 到最后才收口且保留可达。
- shadcn 可能缺 dialog/dropdown——T4 用内联表单或现有组件替代，不新增重组件库。
