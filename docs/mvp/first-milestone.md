# First Milestone

## 实现状态 (Implementation Status)

> 本节对照 `.superpowers/sdd/doc-status-baseline.md` 标注真实状态。图例：✅ 已构建 / 🚧 部分 / 📋 计划中。下方 "Definition" / "Acceptance Criteria" / "Test Fixture" / "What Success Looks Like" 为**目标 / 计划**，保留原文不删，但不代表当前已达成。

本里程碑整体为 🚧 **部分达成 / 多数为目标**。流水线 understand→plan→architect→generate→verify→review 可端到端跑通（仅 React/Next.js），但 "Definition of Done" 与测试夹具要求与现实存在明显差距：

**Acceptance Criteria（实际）**
- ✅ 意图 → TaskGraph、TaskGraph 引用真实文件、graph 缓存 `cacheHit`、stub LLM 结构有效输出、OpenAI provider（plan 阶段）。
- ✅ Review Agent 产出 verdict 与 findings；✅ `tsc --noEmit` 校验。
- 📋 **未达成（目标）**：plan/diff **审批门**、写回仓库文件系统、创建 git commit、生成测试并通过、`mvn test`、Spring Boot 包结构生成、**SSE 实时事件流**。
- 🚧 知识图谱与影响分析仅覆盖 React/Next.js 夹具（无 Spring Boot 部分）。

**Test Fixture（实际与文档不符——以下为现实）**
- 文档声称夹具含 4 个 React 组件 + 2 页面 + 1 Spring Boot 控制器（2 端点）+ 2 JPA 仓库 + 3 JPA 实体。
- 📋 **现实**：`test/fixtures/next-app` 当前仅有 **4 个 React/TSX 文件**（`app/layout.tsx`、`app/page.tsx`、`components/Button.tsx`、`components/Card.tsx`）。**没有任何 Spring Boot 控制器、JPA 实体或仓库**。
- 因此下方 "What Success Looks Like" 中的 Spring Boot 控制器、`CommentDto`、多页面、JPA 实体等期望产物，以及涉及后端/多页面的验证意图，均为**目标 / 计划**，当前无法跑出。

**Known Limitations（更正）**：原文将 "PR creation 为 Increment 3（complete）" 描述为已完成，实际 **PR 创建未实现**，应理解为计划中。

---

## Definition

The first milestone is the completion of Increment 5 — the full, working, end-to-end autonomous engineering loop.

A developer with a real React/Next.js + Spring Boot project can:

1. Submit a natural language feature request
2. Review and approve a structured engineering plan
3. Wait while agents implement, test, and review the feature
4. Review a code diff with automated review findings
5. Approve the diff and see the changes committed to the repository

No manual code writing. No debugging of generated output for the happy path.

---

## Acceptance Criteria

The first milestone is complete when all of the following are true:

### End-to-End Flow

- [ ] An intent submitted via the frontend console results in a structured TaskGraph within 60 seconds
- [ ] The TaskGraph references specific existing files from the project (not generic placeholders)
- [ ] The plan approval UI allows review and approval of individual tasks
- [ ] After plan approval, all tasks execute without manual intervention
- [ ] Generated code changes appear in the diff viewer within 5 minutes of plan approval
- [ ] The Review Agent produces a verdict and at least one finding (or an explicit "no issues found")
- [ ] Approving the diff writes the changes to the repository filesystem
- [ ] A git commit is created for the applied changes

### Code Quality

- [ ] Generated React components follow the project's naming conventions (detected from the knowledge graph)
- [ ] Generated Spring Boot code follows the project's package structure and layering pattern
- [ ] Generated tests run and pass in the verify phase without manual modification
- [ ] TypeScript type checker (`tsc --noEmit`) passes on the generated frontend files
- [ ] Maven compile and test (`mvn test`) passes on the generated backend files

### Platform Correctness

- [ ] The knowledge graph correctly identifies all components in the test fixture project
- [ ] Impact analysis correctly identifies which files would be affected by a given change
- [ ] Graph caching works: second run against unchanged repo reports `cacheHit: true`
- [ ] The stub LLM produces structurally valid output for all agent nodes
- [ ] The OpenAI-compatible LLM provider works with a real API key

### Operational

- [ ] All four layers start successfully following the documented startup order
- [ ] `GET /actuator/health` returns `{"status":"UP"}`
- [ ] `GET http://localhost:8000/health` returns `{"status":"ok"}`
- [ ] `GET http://localhost:3000` loads the frontend console
- [ ] Agent events stream live to the frontend console during a run

---

## Test Fixture

The first milestone is validated against the test fixture at `test/fixtures/next-app`. This fixture is a minimal but realistic Next.js + Spring Boot application with:

- 4 existing React components
- 2 pages
- 1 Spring Boot controller with 2 endpoints
- 2 JPA repositories
- 3 JPA entities

The validation intent: **"add a product detail page that shows the product name, price, and a list of recent comments"**

This intent requires:
- A new Next.js page (`/products/[id]`)
- A new `ProductDetailCard` component
- A new `CommentList` component
- A new Spring Boot endpoint (`GET /api/products/{id}/comments`)
- A new `CommentDto`
- Tests for all of the above

---

## What Success Looks Like

After running this intent through the platform:

```
docs/
  (unchanged)

frontend/
  src/
    app/
      products/
        [id]/
          page.tsx          ← NEW: product detail page
    components/
      products/
        ProductDetailCard.tsx  ← NEW
        ProductDetailCard.test.tsx  ← NEW
      comments/
        CommentList.tsx        ← NEW
        CommentList.test.tsx   ← NEW

control-plane/
  src/main/java/com/example/
    api/
      ProductController.java  ← MODIFIED: new endpoint added
    dto/
      CommentDto.java          ← NEW
  src/test/java/com/example/
    ProductControllerTest.java ← MODIFIED: new test cases added
```

All generated files:
- Pass TypeScript type checking
- Pass Maven compile and test
- Pass ESLint with zero new warnings
- Receive an `approve` or `request_changes` (not `block`) verdict from the Review Agent

---

## Known Limitations at First Milestone

These are documented and accepted limitations, not defects:

1. **No authentication.** The platform is localhost-only. Auth is Increment 6.
2. **Single user.** Multi-tenancy is Increment 6.
3. **No CI/CD integration.** Changes are committed locally; PR creation is Increment 3 (complete) but CI integration is Increment 8.
4. **React and Spring Boot only.** Other stacks are post-MVP.
5. **Self-repair is single-attempt.** If the first repair attempt fails, the run surfaces the failure to the developer rather than looping indefinitely.
6. **Pull request creation** requires a GitHub token; applying locally to the filesystem is the default.
