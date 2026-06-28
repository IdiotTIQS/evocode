# EvoCode 进度账本
分支: increment-5-verify (从 master; 增量0-4 已合并)

## 增量 5 — 验证引擎最小切片 (目标仓库静态检查, 只读)
计划: docs/superpowers/plans/2026-06-28-evocode-increment-5.md
- Task 1: check.js + TsVerifier — pending
- Task 2: verify 节点 + 图扩展 + 契约 — pending
- Task 3: 契约镜像 (schema+Java+前端) — pending
- Task 4: 端到端联调 — pending

## 增量 6 — Architect + Review 智能体 & 提示词接入 LLM
计划: docs/superpowers/plans/2026-06-28-evocode-increment-6-architect-review.md
基线 BASE=7913467 (master + 契约修复)
- Task 1: 提示词加载器 + 真实 OpenAI provider — complete (commit 0c7adc4, review clean; spec ✅ quality approved)
  Minor (final-review triage): test_openai_provider.py 的 `or True` 死断言；prompts.py 仅捕获 OSError 未含 UnicodeDecodeError；test_prompts 依赖磁盘文件。
- Task 2: Architect 节点 + ArchitectureNotes — complete (commits 8d0c575..ab51ff4, review clean after fix wave 1: 修正测试夹具 stats 位置+稳定 tie-break+模块级 re)
- Task 3: codegen 消费架构笔记 — complete (commits ab7f0f8..568dfb5, review clean after fix wave 1: Windows 反斜杠路径穿越加固 + 回归测试). Minor 三角化测试与注释语法留待 final review。
- Task 4: Review 节点 + ReviewOutput — complete (commits 883a3df..7561785, review clean; spec ✅ quality approved). Minor (final triage): _verdict default 可读性；密钥正则仅覆盖 OpenAI 风格。
- Task 5: RunResult.review 四层契约镜像 — complete (commit 6f870da, spec ✅; mvn+tsc 均通过). 评审 Important(@JsonInclude) 经裁决为误报：全代码库既有可选字段均输出 null 无 @JsonInclude，前端 TS 字段可选可容忍 null，加注解反而破坏一致性。Pydantic 别名 filePath/suggestedFix 已验证正确。
- Task 6: 控制台渲染 + 端到端文档 — done

## 控制台 shadcn 布局（plan: docs/superpowers/plans/2026-06-28-console-shadcn-layout.md）
基线 BASE=5dee1ce
- Task 1: shadcn 初始化 + token 命名空间隔离 — complete (commit 7f6068a, review 规范✅质量approved；9 token 加 evo 前缀跨 10 文件无残留，11 组件就位，落地页未回退). Minor(final): skeleton.tsx 用全局 React 命名空间（shadcn 原样,tsc 过）。Task 5 需挂 Toaster/ThemeProvider。
- Task 2: 边栏+工作台布局骨架 — complete (commit b35c41b, 规范✅质量approved). Important: 旧 console/page.tsx 双 main 嵌套 → Task 5 重写时务必移除内层 main 降为 section。Minor: Sidebar 渐变硬编码 #24B291(=chart-2 token)、导航用 <a> 非 <Link>(占位项)。
- Task 3: 意图输入卡片 + 流水线阶段指示器 — complete (commit 2857050, 规范✅质量approved；phase 过去式→index 映射正确、空 phase 安全、终态全亮). Minor: 连接线恒 bg-border 不随进度变色(可选优化)。
- Task 4: 结果 Tabs 分区 — complete (commit 874c8e4, 规范✅质量approved；5 Tab 齐全, TS strict 可选字段守卫完整, 三裁定配色对). Minor: suggestion 用 outline(brief/prompt 文档冲突,功能OK)、findings/diag 用 index key、React 隐式 import。
- Task 5: 组装控制台页 — complete (commit ea5451c, 规范✅质量approved；双 main 已修复(单一 main), Toaster 挂载, 三态互斥, repoPath 空转 undefined). Minor: catch 吞没错误对象、所有失败弹同一文案(控制平面在线但 4xx/5xx 时误导)→ final 收尾改。

### 控制台 final 全分支审查（Opus）：READY TO MERGE，无 Critical/Important
收尾修复 commit 2ccf674：移动端导航可达（移除死菜单按钮，侧栏<md 变横向条）、PipelineStepper done prop（终态全亮）、新增 --success 语义 token 替换硬编码 #24B291。
浏览器 QA：桌面+移动(390px) 均单一 main、5 导航项可达、3 输入在、空态渲染、success token 解析。tsc+build 通过。
可延后 Minor：导航占位项用 <a>(href=#)、连接线不随进度变色、findings/diag index key、dark: 死样式（无主题切换）。

## Control Plane Run 持久化（plan: docs/superpowers/plans/2026-06-28-control-plane-persistence.md）
基线 BASE=d75f0c9
注意：control-plane 跑 mvn test 需联网（离线缺 jaxb 等测试期传递依赖）；mvn -q test 不加 -o。
- Task 1: JPA+H2 依赖与数据源配置 — complete (commit ff6254b, 规范✅质量approved；contextLoads 在新数据源下通过, HikariPool 连上 H2 文件库, data/ 已 gitignore). Minor: url 含分号可加引号、相对路径对 cwd 敏感(从 control-plane/ 启动即对齐)。
- Task 2: RunRecord 实体 + RunStore 持久化 — complete (commits c7a4322..176f637, 规范✅质量approved；混合持久化标量列+RunResult JSON, save 吞异常, CLOB. Fix wave1: id 次级排序键消竞态 + 测试内存库隔离, 4 测试通过)。
- Task 3: submit 接入持久化 + /api/runs 端点 — complete (commit c601617, 规范✅质量approved；7/7 测试过, @MockitoBean→@MockBean 回退, limit clamp, 404, save 旁路不影响 submit). Minor: 残留脚手架文件名注释、通配 import(风格)。
- Task 4: 前端契约镜像 + API 封装 — complete (commit 41452a4, 规范✅质量approved 零发现；RunSummary 7 字段镜像 Java, listRuns/getRun 复用 BASE+ControlPlaneError+encodeURIComponent)。
- Task 5: 控制台历史区 + 详情载入 — complete (commit e7c8c6e, 规范✅质量approved；useEffect active 防竞态, 三态, 稳定 runId key, truncate, 失败兜底不崩). Minor: status Badge 对运行中状态会显红(后端仅 completed/failed 暂无影响)、列表项省略 projectId/时间、未用 ScrollArea。
- Task 6: 端到端验证 + 文档 — complete (commit 含文档更新；端到端实测闭环跑通: POST 意图→reviewed→GET /api/runs 最近优先→GET /api/runs/{id} 完整 RunResult; 清理了测试污染的文件库; 7/7 Java 测试过; 前端 build 过)。
