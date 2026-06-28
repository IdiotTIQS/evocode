# EvoCode 控制台页面 — shadcn/ui 基础布局实现计划

> **For agentic workers:** 用 superpowers:subagent-driven-development 逐任务执行。步骤用 `- [ ]` 跟踪。

**目标：** 把现有朴素控制台（`/console`）重建为一个 shadcn/ui 驱动、AI 产品风格、边栏+工作台布局、Tabs 分区结果呈现的控制台页面。

**架构：** 引入 shadcn/ui（Radix + Tailwind v4，组件代码进仓库无运行时锁定）。控制台采用左侧固定边栏（品牌+导航）+ 右侧工作台布局。工作台分三段：意图输入卡片 → 六节点流水线阶段指示器 → Tabs 分区的运行结果（概览/任务图/生成文件/验证/审查）。复用 `globals.css` 已有设计 token（蓝 `#006AFF`、青 `#24B291`、近黑 `#0C0D0E`），shadcn 主题变量映射到这些 token。数据流不变：`submitIntent()` → `RunResult`。

**技术栈：** Next.js 15 + React 19 + Tailwind v4 + shadcn/ui（new-york 风格）+ lucide-react 图标。

## Global Constraints

- **不破坏现有落地页**：`/`（落地页）及其组件、`globals.css` 现有 `@theme` token、`landing.ts` 不得回退。shadcn 的 CSS 变量须**新增**而非覆盖落地页所用变量。
- **复用现有设计 token**：主色 `--color-accent: #006AFF`、青 `--color-teal: #24B291`、近黑 `--color-ink: #0C0D0E`、灰 `--color-muted`、浅蓝底 `--color-surface-alt`、`--radius-card: 16px`、字体 Inter。shadcn primary 映射到 accent。
- **数据契约不变**：消费 `@/types/intent` 的 `RunResult`（phase/taskGraph/changeSet/verification/review/graphStats），调用 `@/lib/api` 的 `submitIntent`。不改后端、不改类型。
- **必须编译**：每个任务结束跑 `npx tsc --noEmit`，全部完成跑 `npx next build`，均须通过。
- **中文 UI 文案**，专业克制（遵循 frontend-design 写作原则：动词式按钮、状态一致、错误给方向）。
- **无障碍底线**：键盘可达、focus 可见、`prefers-reduced-motion` 尊重。
- **shadcn 在 Tailwind v4**：用 `npx shadcn@latest init`，CSS 变量模式；若 init 在 Tailwind v4 下需要 `components.json` 手工配置，按官方 v4 指引处理。

---

### Task 1: 初始化 shadcn/ui + 基础组件

**Files:**
- Create: `frontend/components.json`
- Create: `frontend/src/lib/utils.ts`（`cn()` 工具）
- Modify: `frontend/src/app/globals.css`（**追加** shadcn 主题变量，不动现有 `@theme`）
- Create: `frontend/src/components/ui/*`（button, card, tabs, badge, input, textarea, label, separator, scroll-area, skeleton, sonner）
- Modify: `frontend/package.json`（新增依赖）

**Interfaces:**
- Produces: `cn(...)` from `@/lib/utils`；`@/components/ui/{button,card,tabs,badge,input,textarea,label,separator,scroll-area,skeleton}`；`Toaster` + `toast` from sonner。

- [ ] **Step 1: 安装 shadcn 依赖**

```bash
cd frontend
pnpm add class-variance-authority clsx tailwind-merge lucide-react sonner
pnpm add -D @types/node
```

- [ ] **Step 2: 写 components.json（Tailwind v4 + 现有别名）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: 写 cn() 工具**

```ts
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: 追加 shadcn 主题变量到 globals.css**

在 `globals.css` 末尾**追加**（不动现有 `@theme`/`body`/`.display` 等）。把 shadcn 语义变量映射到现有设计 token，使 shadcn 组件天然采用 EvoCode 配色：

```css
/* ===== shadcn/ui 主题变量（映射到 EvoCode 设计 token） ===== */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 220 11% 5%;            /* #0C0D0E 近黑 */
    --card: 0 0% 100%;
    --card-foreground: 220 11% 5%;
    --popover: 0 0% 100%;
    --popover-foreground: 220 11% 5%;
    --primary: 215 100% 50%;             /* #006AFF 蓝强调 */
    --primary-foreground: 0 0% 100%;
    --secondary: 210 33% 97%;            /* #F4F8FC 浅蓝底 */
    --secondary-foreground: 220 11% 5%;
    --muted: 210 33% 97%;
    --muted-foreground: 220 8% 49%;      /* #737A87 灰副文 */
    --accent: 210 33% 97%;
    --accent-foreground: 215 100% 50%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --border: 215 22% 89%;               /* #DDE2E9 */
    --input: 215 22% 89%;
    --ring: 215 100% 50%;
    --radius: 0.75rem;
    --chart-1: 215 100% 50%;
    --chart-2: 165 66% 42%;              /* #24B291 青 */
  }
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

注意：现有 `globals.css` 里 `@theme` 已定义 `--color-muted: rgb(115,122,135)`。为避免与 shadcn 的 `--color-muted`（一个浅底色）冲突，本任务**保留落地页用的 `--color-*` 变量**（落地页组件直接引用 `var(--color-muted)` 等），shadcn 组件用上面 `@theme inline` 里的 `hsl()` 映射；二者命名空间有重叠的仅 `muted`/`accent`。**实现要求**：把落地页那几个变量重命名前缀以彻底隔离——把现有 `@theme` 中的 `--color-muted` 改名为 `--color-evo-muted`、`--color-accent` → `--color-evo-accent`、`--color-teal`→`--color-evo-teal`、`--color-surface-alt`→`--color-evo-surface-alt`、`--color-ink`→`--color-evo-ink`、`--color-ink-soft`→`--color-evo-ink-soft`、`--color-border-soft`→`--color-evo-border-soft`，并**同步更新所有落地页组件**（Hero/Pipeline/Agents/Workflow/Principles/CTA/SiteNav/SiteFooter/console 旧页）中对这些变量的引用。这样 shadcn 命名空间与落地页彻底不撞。

- [ ] **Step 5: 添加 shadcn 基础组件**

```bash
cd frontend
npx shadcn@latest add button card tabs badge input textarea label separator scroll-area skeleton sonner --yes
```

若 CLI 在 Tailwind v4 报错，手动从 ui.shadcn.com 对应组件源码创建到 `src/components/ui/`（new-york 风格）。

- [ ] **Step 6: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 7: 验证落地页未回退**

Run: `cd frontend && npx next build`
Expected: BUILD SUCCESS，`/` 与 `/console` 均生成。

- [ ] **Step 8: Commit**

```bash
git add frontend/components.json frontend/src/lib/utils.ts frontend/src/components/ui frontend/src/app/globals.css frontend/package.json frontend/pnpm-lock.yaml frontend/src/components/*.tsx frontend/src/app/console/page.tsx
git commit -m "feat(frontend): 初始化 shadcn/ui，隔离落地页 token 命名空间"
```

---

### Task 2: 控制台布局骨架（边栏 + 工作台壳）

**Files:**
- Create: `frontend/src/components/console/ConsoleSidebar.tsx`
- Create: `frontend/src/components/console/ConsoleShell.tsx`
- Modify: `frontend/src/app/console/layout.tsx`（新建，套用 shell）

**Interfaces:**
- Consumes: `@/components/ui/*`, `cn`, lucide 图标。
- Produces: `<ConsoleShell>{children}</ConsoleShell>` 渲染左边栏（固定 240px）+ 右主区（可滚动）。`ConsoleSidebar` 含品牌、导航项（控制台/流水线说明/智能体/设置占位）、底部"返回首页"。

- [ ] **Step 1: 写 ConsoleSidebar**

左固定边栏：顶部品牌（渐变方块 logo + "EvoCode"），导航列表（lucide 图标 + 标签：Terminal=控制台 active、GitBranch=流水线、Bot=智能体、Settings=设置），底部 `← 返回首页` 链到 `/`。active 项用 `bg-secondary text-primary`。代码用 shadcn `Button variant="ghost"` 风格的链接 + `cn`。响应式：`<md` 隐藏边栏（移动端后续任务处理，本步桌面优先）。

- [ ] **Step 2: 写 ConsoleShell**

```
<div class="flex min-h-screen">
  <ConsoleSidebar class="hidden md:flex w-60 shrink-0 border-r" />
  <div class="flex-1 overflow-y-auto">
    <header 顶栏：当前页标题 + 占位操作 />
    <main class="mx-auto max-w-5xl px-6 py-8">{children}</main>
  </div>
</div>
```

- [ ] **Step 3: 写 console/layout.tsx**

```tsx
import { ConsoleShell } from "@/components/console/ConsoleShell";
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
```

- [ ] **Step 4: 验证编译 + build**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/console frontend/src/app/console/layout.tsx
git commit -m "feat(frontend): 控制台边栏+工作台布局骨架"
```

---

### Task 3: 意图输入卡片 + 流水线阶段指示器

**Files:**
- Create: `frontend/src/components/console/IntentForm.tsx`
- Create: `frontend/src/components/console/PipelineStepper.tsx`

**Interfaces:**
- Consumes: shadcn Card/Input/Textarea/Label/Button/Badge；lucide。
- Produces:
  - `IntentForm`：受控表单，props `{ value, projectId, repoPath, onChange, onSubmit, loading }`。用 Card 包裹，projectId+repoPath 一行两列（`sm:grid-cols-2`），intent 多行 Textarea，提交按钮（loading 时 `Loader2` 旋转 + 禁用 + 文案"运行中…"）。
  - `PipelineStepper`：props `{ phase: string }`。横向 6 节点 `understand→plan→architect→generate→verify→review`，每节点圆点 + 中文标签，按 phase 映射点亮已完成/当前节点（completed=primary 实心、current=primary 描边脉冲、pending=muted）。phase 到节点索引映射：understood→0, planned→1, architected→2, generated→3, verified→4, reviewed→5；终态 reviewed 全亮。

- [ ] **Step 1: 写 PipelineStepper（含 phase→index 映射常量）**

```tsx
const PHASE_ORDER = ["understand","plan","architect","generate","verify","review"] as const;
const PHASE_TO_INDEX: Record<string, number> = {
  understood:0, planned:1, architected:2, generated:3, verified:4, reviewed:5,
};
const PHASE_LABEL: Record<string,string> = {
  understand:"理解", plan:"规划", architect:"架构", generate:"生成", verify:"验证", review:"审查",
};
```
渲染：节点间用细线连接，`completed`(index<=current) 实心 primary，`current`(===current) 描边 + `motion-safe:animate-pulse`，否则 muted。

- [ ] **Step 2: 写 IntentForm**

用 Card：CardHeader（标题"提交意图" + 描述），CardContent（表单字段），CardFooter（提交按钮）。文案动词式：按钮"运行意图"，loading "运行中…"。无障碍：每个输入配 `<Label htmlFor>`。

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/console/IntentForm.tsx frontend/src/components/console/PipelineStepper.tsx
git commit -m "feat(frontend): 意图输入卡片 + 六节点流水线阶段指示器"
```

---

### Task 4: 结果 Tabs（概览/任务图/生成文件/验证/审查）

**Files:**
- Create: `frontend/src/components/console/ResultTabs.tsx`
- Create: `frontend/src/components/console/ReviewPanel.tsx`（审查发现列表，含 severity 配色）

**Interfaces:**
- Consumes: shadcn Tabs/Card/Badge/ScrollArea/Separator；`RunResult` from `@/types/intent`。
- Produces:
  - `ResultTabs`：props `{ result: RunResult }`。5 个 Tab：概览（runId/status/phase/message + graphStats 小卡片网格）、任务图（task 列表，kind 用 Badge 上色）、生成文件（changeSet，每个文件用 Card + `<pre>` 折叠，appliedFiles 提示）、验证（passed/failed + 诊断）、审查（用 ReviewPanel）。
  - `ReviewPanel`：props `{ review: ReviewOutput }`。裁定大徽章（approve=teal、request_changes=amber、block=destructive），summary，findings 列表（severity 上色：critical=destructive、major=amber、minor=muted、suggestion=secondary）。

- [ ] **Step 1: 写 ReviewPanel**

裁定 → 颜色/图标映射（CheckCircle2/AlertTriangle/XCircle）。findings 用列表，每条 severity Badge + filePath（code 样式）+ message + 可选 suggestedFix（斜体 muted）。

- [ ] **Step 2: 写 ResultTabs**

`<Tabs defaultValue="overview">`，TabsList 含 5 项。各 TabsContent 按上述渲染。task kind → Badge variant 映射：frontend=primary、backend=teal、test=secondary、generic=muted。生成文件用 ScrollArea 限高 + `<pre>`。

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/console/ResultTabs.tsx frontend/src/components/console/ReviewPanel.tsx
git commit -m "feat(frontend): 结果 Tabs 分区（概览/任务/文件/验证/审查）"
```

---

### Task 5: 组装控制台页 + 状态/错误/空态处理 + 端到端验证

**Files:**
- Modify: `frontend/src/app/console/page.tsx`（用新组件重写，保留数据逻辑）

**Interfaces:**
- Consumes: IntentForm, PipelineStepper, ResultTabs, `submitIntent`, sonner `toast`。

- [ ] **Step 1: 重写 console/page.tsx**

`"use client"`。state: intent/projectId/repoPath/result/loading/error。`onSubmit`：setLoading→try submitIntent→setResult；catch→`toast.error(...)`（错误给方向："无法连接控制平面，请确认服务已启动"）。布局：IntentForm 在上 → result 存在时显示 PipelineStepper + ResultTabs；result 为空时显示空态卡片（lucide 图标 + "提交一个意图开始" 引导文案）。loading 时 ResultTabs 区显示 Skeleton。在 layout 里挂 `<Toaster />`（或本页）。

- [ ] **Step 2: 验证编译 + build**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Expected: 通过，`/console` 生成。

- [ ] **Step 3: 浏览器 QA（无需后端）**

启动 `npx next start -p 3100`，用浏览器导航 `/console`：确认边栏、意图表单、空态渲染；DOM 检查边栏存在、表单字段存在、空态文案存在。（提交需后端，本步只验证 UI 渲染与布局；空态/loading 不依赖后端。）停服务。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/console/page.tsx
git commit -m "feat(frontend): 组装 shadcn 控制台页 — 表单/阶段/结果/空态/错误处理"
```

---

## Self-Review

**1. 覆盖：** 组件库=shadcn/ui（Task 1）✓；边栏+工作台布局（Task 2）✓；意图输入+六节点阶段（Task 3）✓；Tabs 分区结果（Task 4）✓；组装+空态/错误（Task 5）✓。AI 产品风格通过 shadcn new-york + EvoCode token 实现 ✓。

**2. 占位扫描：** 各任务步骤含具体代码或明确组件契约，无 TBD。shadcn 组件由 CLI 生成（Step 标注 CLI 失败时的手动回退）。

**3. 类型一致：** `RunResult`/`ReviewOutput` 字段全程引用 `@/types/intent`，未改契约。`PipelineStepper` 的 phase→index 映射在 Task 3 定义，Task 5 传入 `result.phase`。`cn` 在 Task 1 定义，后续任务引用。

**4. 风险点：**
- shadcn 在 Tailwind v4 的 init 可能需手动配置——Task 1 Step 5 已给回退路径。
- **token 命名冲突**是最大风险（落地页用 `--color-accent` 等，shadcn 也要语义色）——Task 1 Step 4 通过给落地页变量加 `--color-evo-*` 前缀彻底隔离，并要求同步更新所有落地页组件引用。这是必须一次做对的整体改动。
- 现有 `/console` 旧页在 Task 1 重命名 token 时会被一并更新引用，Task 5 整体重写，无中间断裂。
- Windows：构建命令用 `npx`，无 venv 依赖。
