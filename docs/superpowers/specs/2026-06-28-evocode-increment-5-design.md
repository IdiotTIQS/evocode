# EvoCode 增量 5 — 验证引擎最小切片（目标仓库静态检查，只读）设计文档

> 状态：自主推进（loop/goal 模式），AI 自主决策
> 日期：2026-06-28
> 前置：增量 4 已合并（影响/依赖分析驱动规划）

## 1. 背景与本体定位

EvoCode 的承重墙是"图提出假设，验证做裁定"。前四个增量让 understand/plan/PKG 渐次真实化，但 **Planner 产出的任务从未被验证**——这是愿景里最关键的缺口。增量 5 让"验证"这个本体支柱首次落地：新增 verify 阶段，对目标仓库跑**只读静态检查**，把 `{passed, diagnostics}` 作为"现实裁定"纳入 RunResult。

**诚实的边界**：受 Docker 缺失制约，本增量**不执行生成的代码、不做沙箱、不做自动修复**。它验证的是**目标仓库现有代码**的静态类型健康（via ts-morph `getPreEmitDiagnostics`），而非"生成的改动是否正确"。这是验证支柱的第一块砖——先让"产出现实裁定"这一步存在且被纳入结果，后续增量（有沙箱时）再验证生成的改动。这个定位在 RunResult 的语义里明确标注，不夸大。

## 2. 范围与边界

### 目标

- 新增 `tools/ts-checker/check.js`：ts-morph 静态类型检查器（复用 ts-extractor 的 ts-morph 依赖），吃目录路径，吐 `{passed, diagnostics:[{file,line,code,message}]}`（全部诊断，不过滤）。
- Python `pkg/verifier.py`：`TsVerifier`（subprocess 调 check.js）+ 噪声码过滤（Option A：2307/2304/2503/7026/2874）+ `is_available()` 守卫。
- LangGraph 图扩展：understand → plan → **verify**。verify 节点对 repoPath 跑检查，产出 verdict。
- 契约：RunResult 增加可选 `verification: {checked:bool, passed:bool, diagnosticCount:int, diagnostics:[{file,line,code,message}]}`（diagnostics 截断前 N 条避免膨胀）。
- 安全回退：无 repoPath / node 不可用 / 检查失败 → `verification.checked=false`，不影响 plan 结果，/runs 绝不 500。

### 明确不做（YAGNI）

- 不执行生成/不可信代码，不做 Docker 沙箱。
- 不验证"生成的改动"——本增量验证目标仓库现状（生成改动的验证待有沙箱的增量）。
- 不做自动修复循环（repair）——只产出裁定，不消费。
- 不做 lint（ESLint 需目标 repo 配置）——只 ts-morph 类型检查。
- 不做 Java/前端的诊断深度展示——透传 + 展示 passed/count。
- 不持久化验证结果。

## 3. 架构

```
LangGraph: understand → plan → verify → END

verify_node(state):
  repo_path 有效 & verifier 可用?
    ├─ raw = TsVerifier.check(repo_path)        # subprocess node check.js
    ├─ meaningful = filter_noise(raw.diagnostics)  # Option A 过滤
    └─ verification = {checked:True, passed: len(meaningful)==0,
                       diagnosticCount: len(meaningful),
                       diagnostics: meaningful[:20]}   # 截断
  否则 → verification = {checked:False, passed:False, diagnosticCount:0, diagnostics:[]}
  → state.verification
```

### 新增/变更结构
```
tools/ts-checker/
  check.js              # ts-morph 静态检查器（尽调验证版）
  (复用 ts-extractor/node_modules — check.js require 绝对路径或 NODE_PATH)
ai-runtime/src/evocode_runtime/pkg/
  verifier.py           # TsVerifier + NOISE_CODES + filter
graph/
  state.py              # RunState +verification
  nodes.py              # +verify_node
  builder.py            # 图加 verify 节点 plan→verify→END
models.py               # RunResult +verification(VerificationResult)
run_service.py          # RunResult 填 verification
```

注：check.js 复用 ts-extractor 的 ts-morph。放 tools/ts-checker/，require 用相对 ts-extractor 的路径，或检查器自己的 package.json 也依赖 ts-morph（更干净，但多一份 node_modules）。**决策：check.js require ts-extractor 的 ts-morph 绝对/相对路径**（零额外安装，尽调已验证此法可行）。

## 4. 契约升级

新增 `VerificationResult`：
| 字段 | 类型 | 说明 |
|------|------|------|
| `checked` | bool | 是否实际执行了检查（false=跳过/不可用） |
| `passed` | bool | 过滤噪声后是否 0 诊断 |
| `diagnosticCount` | int | 有意义诊断数 |
| `diagnostics` | Diagnostic[] | 截断前 20 条 |

`Diagnostic`: `{file:string, line:int|null, code:int, message:string}`

`RunResult` 增加可选 `verification: VerificationResult | null`。四处镜像。

## 5. verify 节点与安全

- verify 节点独立于 plan——即使 verify 失败/跳过，plan 的 taskGraph 仍返回。
- TsVerifier.is_available()：node 在 PATH + check.js 存在 + ts-extractor node_modules 存在（复用依赖）。
- 噪声过滤在 Python 侧（check.js 通用吐全部）。NOISE_CODES = {2307,2304,2503,7026,2874}。
- diagnostics 截断 20 条防响应膨胀（diagnosticCount 反映过滤后总数）。
- 超时 120s（check.js 冷启 ~4s，目标 repo 大时给余量）。

## 6. 测试策略

- **Node check.js**：Python 集成测试覆盖（对 fixture 跑，断言结构）。
- **pytest**：
  - filter_noise 单测：喂含噪声码+真错的诊断列表，断言只留真错
  - TsVerifier 集成（requires_node）：对 clean fixture → passed=True（过滤后0）；对临时含真类型错的目录 → passed=False, 含 code 2322
  - verify_node：带 repoPath fixture → checked=True passed=True；无 repoPath → checked=False
  - run_service：带 repoPath → RunResult.verification.checked=True
  - 增量1-4 的 46 测试继续通过
- **端到端**：带 repoPath 请求 → verification.checked=true, passed=true（clean fixture）。

## 7. 风险

- **类型检查依赖噪声过滤启发式**：缺 @types 的 repo 会报大量解析错，靠固定码表过滤。诚实标注：这不是完整类型检查，是"过滤环境噪声后的真类型错"裁定。过滤码表可能漏/误。fixture 验证当前码表足够。
- **冷启动 ~4s**：每次 /runs 多 4s。增量 5 接受（一次性门，非热循环）。后续可做持久 worker。
- **回退**：verify 任何失败 → checked=False，绝不影响 plan/不让 /runs 500。
- **诚实定位**：RunResult.verification 验证的是目标 repo 现状，非生成改动——文档/字段语义明确，不夸大为"验证了生成的代码"。
