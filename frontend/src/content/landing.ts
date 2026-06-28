// EvoCode 落地页文案。
// 内容来源：docs/vision/{vision,mission,product-positioning}.md、docs/README.md（Core Principles）、
// docs/agents/*、docs/architecture/ai-runtime-architecture.md、.superpowers/sdd/doc-status-baseline.md。
// 原则：只宣传 baseline 中标注为「已构建 ✅」的真实能力；未建成的平台能力（鉴权 / RAG / 沙箱 / Git-PR / 持��化）
// 不作为卖点。六节点流水线与智能体团队是真实、可端到端跑通的核心，重点呈现。

export const landing = {
  brand: {
    name: "EvoCode",
    tagline: "自主软件工程平台 — 以意图驱动构建软件",
  },

  nav: [
    { label: "愿景", href: "#vision" },
    { label: "流水线", href: "#pipeline" },
    { label: "智能体", href: "#agents" },
    { label: "原则", href: "#principles" },
    { label: "开始使用", href: "#cta" },
  ],

  hero: {
    title: "意图，是新的源代码",
    subtitle:
      "你定义系统要做什么、为什么做、必须遵守哪些约束；EvoCode 让一组专职智能体去设计、实现、验证并审查代码。开发者从代码作者，转变为意图的架构师与决策者。",
    primaryCta: "提交一个意图",
    secondaryCta: "查看流水线",
    tagline: "Intent is the new source code. Agents build. Humans decide.",
  },

  pipeline: {
    heading: "六节点流水线",
    subheading:
      "每一次意图都流经一条确定性的 LangGraph 流水线：从理解既有代码，到产出经验证、可审查的变更。当前可在本地端到端跑通。",
    steps: [
      {
        key: "understand",
        title: "理解",
        desc:
          "用 ts-morph 抽取 TypeScript / React 项目结构，构建知识图谱并缓存到 SQLite，计算依赖与影响范围。先理解，再改动。",
      },
      {
        key: "plan",
        title: "规划",
        desc:
          "将意图分解为有依赖顺序的任务图（TaskGraph），按 frontend / backend / test / review 等类型分类。默认确定性规划，可选接入 OpenAI 兼容模型。",
      },
      {
        key: "architect",
        title: "架构",
        desc:
          "在知识图谱的上下文中评估每个任务：识别需遵循的既有模式与命名约定，判断该扩展现有抽象还是引入新抽象。",
      },
      {
        key: "generate",
        title: "生成",
        desc:
          "消费架构笔记产出文件变更，写入隔离的 evocode_generated/ 目录而非直接改动既有文件。当前为确定性模板生成。",
      },
      {
        key: "verify",
        title: "验证",
        desc:
          "对生成的变更运行只读 TypeScript 类型检查，报告通过 / 失败与诊断信息。变更先被验证，再被采纳。",
      },
      {
        key: "review",
        title: "审查",
        desc:
          "对整组变更做确定性裁定：approve / request_changes / block，并输出按严重程度分类的审查发现。作为交给人类决策前的质量门。",
      },
    ],
  },

  agents: {
    heading: "像团队一样协作的智能体",
    subheading:
      "每个智能体都有明确的角色、有界的职责和清晰的接口。它们在共享的任务计划下分工协作，而不是一个通才模型包揽全部。",
    items: [
      {
        name: "Planner",
        role: "把开发者的意图转化为结构化、有依赖顺序的可执行任务图。",
        status: "built" as const,
      },
      {
        name: "Architect",
        role: "在既有代码上下文中做架构决策，评估变更影响，守护设计一致性。",
        status: "built" as const,
      },
      {
        name: "Review",
        role: "对整组变更做自动化代码审查，是平台的质量门。",
        status: "built" as const,
      },
      {
        name: "Frontend",
        role: "负责 UI、组件、状态与路由的变更。当前由确定性模板实现，尚未接入真实 LLM 生成。",
        status: "planned" as const,
      },
      {
        name: "Backend",
        role: "负责 API、领域模型与持久化。当前由确定性模板实现，尚未接入真实 LLM 生成。",
        status: "planned" as const,
      },
      {
        name: "Test",
        role: "为变更生成测试，作为 verify 阶段的质量信号。当前由确定性模板实现，尚未接入真实 LLM 生成。",
        status: "planned" as const,
      },
    ],
  },

  principles: {
    heading: "核心原则",
    items: [
      { title: "意图优先", desc: "需求先于代码 — 工作的单元是一个需求，而非文件、函数或代码行。" },
      { title: "先架构后编码", desc: "设计决策被显式做出并记录，不让结构在编码中悄然漂移。" },
      { title: "先理解后修改", desc: "智能体在改动任何东西之前，先把项目构建成知识图谱。" },
      { title: "持续演进", desc: "软件没有完成态，只有被不断演进的状态。" },
      { title: "最小变更", desc: "做满足意图的最小改动，不重写能用的，不重构不在范围内的。" },
      { title: "软件即知识图谱", desc: "组件、关系与依赖是一等公民，而非散落的文件。" },
      { title: "智能体即团队成员", desc: "每个智能体都有明确的角色、职责和操作边界。" },
    ],
  },

  workflow: {
    heading: "端到端工作流",
    steps: [
      { title: "提交意图", desc: "在控制台用自然语言描述你想要的变更。" },
      { title: "转发与编排", desc: "Spring Boot 控制平面经 POST /api/intents 转发到 Python AI Runtime。" },
      { title: "流水线执行", desc: "AI Runtime 按 understand → plan → architect → generate → verify → review 一次性跑完。" },
      { title: "结果呈现", desc: "控制台渲染任务图、变更集、验证与审查结果，由人类做最终决策。" },
    ],
  },

  cta: {
    heading: "在本地跑通一次完整闭环",
    body:
      "EvoCode 当前是一个可端到端跑通的最小闭环：默认确定性、无需 LLM 凭据即可运行，也可按需接入 OpenAI 兼容模型。克隆仓库，提交你的第一个意图。",
    button: "查看 GitHub 仓库",
    repoUrl: "https://github.com/IdiotTIQS/evocode",
  },

  footer: {
    note: "EvoCode — Autonomous Software Engineering Platform. Intent is the new source code. Agents build. Humans decide.",
    links: [
      { label: "愿景", href: "#vision" },
      { label: "流水线", href: "#pipeline" },
      { label: "智能体", href: "#agents" },
      { label: "GitHub", href: "https://github.com/IdiotTIQS/evocode" },
    ],
  },
};

export type Landing = typeof landing;
