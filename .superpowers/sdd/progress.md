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
