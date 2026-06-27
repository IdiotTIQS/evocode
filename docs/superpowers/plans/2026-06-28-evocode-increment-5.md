# EvoCode 增量 5 — 验证引擎最小切片 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** 新增 verify 阶段，对目标仓库跑只读静态类型检查（ts-morph getPreEmitDiagnostics + 噪声过滤），把 {passed, diagnostics} 作为现实裁定纳入 RunResult。让"验证"本体支柱首次落地。

**Architecture:** 四层 FINAL 不变。LangGraph 图扩展 understand→plan→verify。check.js 复用 ts-extractor 的 ts-morph（零额外安装）。诚实定位：验证目标 repo 现状，非生成改动；无沙箱不执行代码。

**Tech Stack:** Node 22 + ts-morph 28.0.0（复用）/ Python 3.11 subprocess / LangGraph 1.2.6 / Spring Boot / Next.js。

## Global Constraints

- 四层 FINAL；依赖单向向下。
- check.js 用尽调验证版（verify-notes.md）：ts-morph Project + getPreEmitDiagnostics，require ts-extractor 的 ts-morph + @ts-morph/common 的 ts。吐全部诊断（不过滤）。
- 噪声过滤在 Python 侧：NOISE_CODES = {2307,2304,2503,7026,2874}（Option A）。passed = 过滤后 0 诊断。
- 安全回退：无 repoPath / node 不可用 / 检查失败/超时 → verification.checked=False；绝不影响 plan 的 taskGraph；/runs 绝不 500。
- diagnostics 截断 20 条；diagnosticCount = 过滤后总数。
- 契约 RunResult +verification(VerificationResult{checked,passed,diagnosticCount,diagnostics[]})，四处镜像。
- 增量1-4 的 46 测试继续通过。
- venv: ai-runtime/.venv (Windows: .venv/Scripts/python)。subprocess 列表参数，timeout=120。

---

### Task 1: tools/ts-checker/check.js + TsVerifier

**Files:**
- Create: `tools/ts-checker/check.js`
- Create: `tools/ts-checker/README.md`（说明复用 ts-extractor 的 ts-morph）
- Create: `ai-runtime/src/evocode_runtime/pkg/verifier.py`
- Modify: `ai-runtime/src/evocode_runtime/pkg/__init__.py`
- Test: `ai-runtime/tests/test_verifier.py`

**Interfaces:**
- Consumes: ts-extractor 的 ts-morph（绝对/相对路径 require）。
- Produces:
  - `node check.js <dir>` → stdout JSON `{passed, diagnostics:[{file,line,code,message}]}`（全部诊断）
  - `pkg.verifier.TsVerifier(check_js=None)`：`.is_available()->bool`、`.check(repo_path)->dict`（{passed, diagnostics, diagnosticCount}，已过滤噪声）、`VerificationError`
  - `pkg.verifier.NOISE_CODES`、`filter_noise(diagnostics)->list`

- [ ] **Step 1: 写 tools/ts-checker/check.js**（尽调验证版，require 路径用相对 ts-extractor）

```js
#!/usr/bin/env node
/**
 * check.js - Minimal static type-checker using ts-morph (reused from ../ts-extractor)
 * Usage: node check.js <directory-path>
 * Outputs: JSON { passed, diagnostics: [{file, line, code, message}] } (ALL diagnostics, unfiltered)
 */
const path = require("path");
const TSM_DIR = path.join(__dirname, "..", "ts-extractor", "node_modules");
const { Project } = require(path.join(TSM_DIR, "ts-morph"));
const ts = require(path.join(TSM_DIR, "@ts-morph", "common", "dist", "typescript.js"));

const targetDir = process.argv[2];
if (!targetDir) {
  process.stderr.write("Usage: node check.js <directory-path>\n");
  process.exit(1);
}

const project = new Project({
  compilerOptions: {
    jsx: 2, target: 99, moduleResolution: 100,
    skipFileDependencyResolution: true, noEmit: true, strict: true,
  },
  skipAddingFilesFromTsConfig: true,
  skipFileDependencyResolution: true,
});

const dirFwd = targetDir.replace(/\\/g, "/");
project.addSourceFilesAtPaths([
  dirFwd + "/**/*.ts",
  dirFwd + "/**/*.tsx",
  "!" + dirFwd + "/**/node_modules/**",
  "!" + dirFwd + "/**/*.d.ts",
]);

const rawDiagnostics = project.getPreEmitDiagnostics();
const diagnostics = rawDiagnostics.map((d) => {
  const sourceFile = d.getSourceFile();
  const file = sourceFile ? sourceFile.getFilePath() : "<unknown>";
  let line = null;
  if (sourceFile) {
    const start = d.getStart();
    if (start != null) line = sourceFile.getLineAndColumnAtPos(start).line;
  }
  const code = d.getCode();
  const rawMsg = d.getMessageText();
  const message = typeof rawMsg === "string"
    ? rawMsg : ts.flattenDiagnosticMessageText(rawMsg, "\n");
  return { file, line, code, message };
});

process.stdout.write(JSON.stringify({ passed: diagnostics.length === 0, diagnostics }, null, 2) + "\n");
```

- [ ] **Step 2: 写 tools/ts-checker/README.md**

说明：static type checker via ts-morph；复用 `../ts-extractor/node_modules`（无独立安装）；噪声过滤在 Python 侧；只读、不执行代码。

- [ ] **Step 3: 实跑 check.js 验证**

Run: `cd /e/evocode && node tools/ts-checker/check.js test/fixtures/next-app | python -c "import json,sys; d=json.load(sys.stdin); print('passed:',d['passed'],'diags:',len(d['diagnostics']),'codes:',sorted(set(x['code'] for x in d['diagnostics'])))"`
Expected: passed=False（未过滤含噪声），codes 含 2503/7026/2874 等。确认 JSON 合法。

- [ ] **Step 4: 写 test_verifier.py（失败先行）**

```python
import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.pkg.verifier import TsVerifier, filter_noise, NOISE_CODES
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


def test_filter_noise_removes_env_codes():
    diags = [
        {"file": "a", "line": 1, "code": 2503, "message": "Cannot find namespace 'React'."},
        {"file": "a", "line": 2, "code": 7026, "message": "JSX implicitly any"},
        {"file": "a", "line": 3, "code": 2322, "message": "Type 'string' not assignable to 'number'."},
    ]
    out = filter_noise(diags)
    assert len(out) == 1 and out[0]["code"] == 2322


@requires_node
def test_clean_fixture_passes():
    v = TsVerifier()
    assert v.is_available()
    res = v.check(FIXTURE)
    assert res["passed"] is True  # 过滤噪声后 0
    assert res["diagnosticCount"] == 0


@requires_node
def test_broken_file_fails():
    tmp = tempfile.mkdtemp()
    try:
        with open(os.path.join(tmp, "broken.tsx"), "w") as f:
            f.write("const x: number = \"string\";\nexport default function B(){return <div/>;}\n")
        res = TsVerifier().check(tmp)
        assert res["passed"] is False
        assert any(d["code"] == 2322 for d in res["diagnostics"])
    finally:
        shutil.rmtree(tmp)
```

- [ ] **Step 5: 跑测试确认失败**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_verifier.py -v`
Expected: FAIL（模块不存在）。

- [ ] **Step 6: 写 verifier.py**

```python
import json
import os
import shutil
import subprocess
from pathlib import Path

NOISE_CODES = {2307, 2304, 2503, 7026, 2874}


class VerificationError(Exception):
    pass


def filter_noise(diagnostics: list[dict]) -> list[dict]:
    return [d for d in diagnostics if d.get("code") not in NOISE_CODES]


def _default_check_js() -> str:
    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    return str(repo_root / "tools" / "ts-checker" / "check.js")


class TsVerifier:
    def __init__(self, check_js: str | None = None) -> None:
        self.check_js = check_js or os.environ.get("EVOCODE_CHECK_JS", _default_check_js())

    @staticmethod
    def node_available() -> bool:
        return shutil.which("node") is not None

    def is_available(self) -> bool:
        js = Path(self.check_js)
        tsm = js.parent.parent / "ts-extractor" / "node_modules"
        return self.node_available() and js.is_file() and tsm.is_dir()

    def check(self, repo_path: str) -> dict:
        if not self.is_available():
            raise VerificationError("node or checker not available")
        if not os.path.isdir(repo_path):
            raise VerificationError(f"not a directory: {repo_path}")
        try:
            proc = subprocess.run(
                ["node", self.check_js, repo_path],
                capture_output=True, text=True, check=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise VerificationError(f"checker failed: {exc}") from exc
        try:
            raw = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise VerificationError(f"invalid checker output: {exc}") from exc
        if not isinstance(raw, dict) or not isinstance(raw.get("diagnostics"), list):
            raise VerificationError("unexpected checker output shape")
        meaningful = filter_noise(raw["diagnostics"])
        return {"passed": len(meaningful) == 0,
                "diagnostics": meaningful,
                "diagnosticCount": len(meaningful)}
```

- [ ] **Step 7: pkg/__init__.py 导出**

加 `from evocode_runtime.pkg.verifier import TsVerifier, VerificationError, filter_noise, NOISE_CODES` 并入 `__all__`。

- [ ] **Step 8: 跑测试确认通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest tests/test_verifier.py -v`
Expected: 3 passed（filter 单测 + clean fixture pass + broken fail）。

- [ ] **Step 9: Commit**

```bash
git add tools/ts-checker/ ai-runtime/src/evocode_runtime/pkg/verifier.py ai-runtime/src/evocode_runtime/pkg/__init__.py ai-runtime/tests/test_verifier.py
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): read-only TS static-check verifier (ts-morph diagnostics)"
```

---

### Task 2: verify 节点 + LangGraph 图扩展 + 契约

**Files:**
- Modify: `ai-runtime/src/evocode_runtime/models.py`（VerificationResult, Diagnostic; RunResult +verification）
- Modify: `ai-runtime/src/evocode_runtime/graph/state.py`（RunState +verification）
- Modify: `ai-runtime/src/evocode_runtime/graph/nodes.py`（+verify_node）
- Modify: `ai-runtime/src/evocode_runtime/graph/builder.py`（plan→verify→END）
- Modify: `ai-runtime/src/evocode_runtime/run_service.py`（RunResult 填 verification + 初始 state 加 verification）
- Test: `ai-runtime/tests/test_verify_node.py`

**Interfaces:**
- Consumes: Task 1 的 TsVerifier。
- Produces:
  - `models.Diagnostic(file,line,code,message)`、`models.VerificationResult(checked,passed,diagnostic_count alias diagnosticCount,diagnostics)`、`RunResult.verification: VerificationResult|None`。
  - `verify_node(state)->{"verification": {...}}`。

- [ ] **Step 1: models.py 加 VerificationResult/Diagnostic**

```python
class Diagnostic(BaseModel):
    file: str
    line: int | None = None
    code: int
    message: str


class VerificationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    checked: bool = False
    passed: bool = False
    diagnostic_count: int = Field(default=0, alias="diagnosticCount")
    diagnostics: list[Diagnostic] = Field(default_factory=list)
```
RunResult 加 `verification: "VerificationResult | None" = Field(default=None)`（无 alias，字段名即 verification）。

- [ ] **Step 2: graph/state.py 加字段**

RunState 加 `verification: dict`。

- [ ] **Step 3: 写 test_verify_node.py（失败先行）**

```python
import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.graph.nodes import verify_node
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


def test_verify_no_repo_not_checked():
    out = verify_node({"intent": "x", "projectId": "p", "repoPath": "",
                       "context": {}, "phase": "planned", "tasks": [], "verification": {}})
    assert out["verification"]["checked"] is False


@requires_node
def test_verify_clean_fixture_passes():
    out = verify_node({"intent": "x", "projectId": "p", "repoPath": FIXTURE,
                       "context": {}, "phase": "planned", "tasks": [], "verification": {}})
    assert out["verification"]["checked"] is True
    assert out["verification"]["passed"] is True
    assert out["verification"]["diagnosticCount"] == 0
```

- [ ] **Step 4: graph/nodes.py 加 verify_node**

```python
from evocode_runtime.pkg import TsVerifier, VerificationError

def verify_node(state: RunState) -> dict:
    repo_path = state.get("repoPath") or ""
    not_checked = {"checked": False, "passed": False, "diagnosticCount": 0, "diagnostics": []}
    if not (repo_path and os.path.isdir(repo_path)):
        return {"verification": not_checked}
    verifier = TsVerifier()
    if not verifier.is_available():
        return {"verification": not_checked}
    try:
        res = verifier.check(repo_path)
        return {"verification": {
            "checked": True, "passed": res["passed"],
            "diagnosticCount": res["diagnosticCount"],
            "diagnostics": res["diagnostics"][:20]}}
    except VerificationError:
        return {"verification": not_checked}
    except Exception:  # noqa: BLE001  绝不让 verify 拖垮 /runs
        logger.exception("verify_node failed for project %s", state.get("projectId"))
        return {"verification": not_checked}
```
（确保 nodes.py 顶部已有 logger）

- [ ] **Step 5: graph/builder.py 加 verify 节点**

```python
from evocode_runtime.graph.nodes import understand_node, plan_node, verify_node

def build_graph():
    builder = StateGraph(RunState)
    builder.add_node("understand", understand_node)
    builder.add_node("plan", plan_node)
    builder.add_node("verify", verify_node)
    builder.add_edge(START, "understand")
    builder.add_edge("understand", "plan")
    builder.add_edge("plan", "verify")
    builder.add_edge("verify", END)
    return builder.compile(checkpointer=MemorySaver())
```

- [ ] **Step 6: run_service.py — 初始 state + 填 verification**

初始 invoke state 加 `"verification": {}`。构造 RunResult 时：
```python
            v = final.get("verification") or {}
            verification = VerificationResult(
                checked=v.get("checked", False),
                passed=v.get("passed", False),
                diagnosticCount=v.get("diagnosticCount", 0),
                diagnostics=[Diagnostic(**d) for d in v.get("diagnostics", [])]) if v else None
```
RunResult 构造加 `verification=verification`。失败路径 verification=None。导入 VerificationResult, Diagnostic。

- [ ] **Step 7: 跑全部测试**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -v`
Expected: 全绿（46 + verifier 3 + verify_node 2 = 51）。node 测试实跑不 skip。DB 用 conftest 隔离。

- [ ] **Step 8: Commit**

```bash
git add ai-runtime/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat(ai-runtime): verify stage in graph, verification verdict in RunResult"
```

---

### Task 3: 契约镜像（schema + Java + 前端）

**Files:**
- Modify: `contracts/intent.schema.json`
- Create: `control-plane/.../dto/Diagnostic.java`
- Create: `control-plane/.../dto/VerificationResult.java`
- Modify: `control-plane/.../dto/RunResult.java`
- Modify: `frontend/src/types/intent.ts`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: RunResult.verification。
- Produces: 四处镜像；前端展示验证裁定。

- [ ] **Step 1: contracts/intent.schema.json**

新增定义：
```json
"Diagnostic": {
  "type": "object",
  "required": ["file", "code", "message"],
  "properties": {
    "file": {"type": "string"},
    "line": {"type": ["integer", "null"]},
    "code": {"type": "integer"},
    "message": {"type": "string"}
  }
},
"VerificationResult": {
  "type": "object",
  "required": ["checked", "passed", "diagnosticCount", "diagnostics"],
  "properties": {
    "checked": {"type": "boolean"},
    "passed": {"type": "boolean"},
    "diagnosticCount": {"type": "integer"},
    "diagnostics": {"type": "array", "items": {"$ref": "#/definitions/Diagnostic"}}
  }
}
```
RunResult properties 加 `"verification": {"$ref": "#/definitions/VerificationResult"}`（不进 required，可选）。验证 JSON 解析。

- [ ] **Step 2: Diagnostic.java**

```java
package com.evocode.controlplane.dto;

public record Diagnostic(
    String file,
    Integer line,
    int code,
    String message
) {}
```

- [ ] **Step 3: VerificationResult.java**

```java
package com.evocode.controlplane.dto;

import java.util.List;

public record VerificationResult(
    boolean checked,
    boolean passed,
    int diagnosticCount,
    List<Diagnostic> diagnostics
) {}
```

- [ ] **Step 4: RunResult.java 加 verification**

在现有字段后加 `VerificationResult verification`。

- [ ] **Step 5: 编译 + 测试**

Run: `cd control-plane && mvn -q compile && mvn -q test`
Expected: BUILD SUCCESS。

- [ ] **Step 6: frontend types/intent.ts**

```typescript
export interface Diagnostic {
  file: string;
  line: number | null;
  code: number;
  message: string;
}

export interface VerificationResult {
  checked: boolean;
  passed: boolean;
  diagnosticCount: number;
  diagnostics: Diagnostic[];
}
```
RunResult 加 `verification?: VerificationResult;`

- [ ] **Step 7: frontend page.tsx 展示验证**

在 graphStats 渲染后加：
```tsx
{result?.verification?.checked && (
  <p>验证：{result.verification.passed ? "✓ 通过" : `✗ ${result.verification.diagnosticCount} 个问题`}</p>
)}
```

- [ ] **Step 8: 前端构建**

Run: `cd frontend && pnpm build`
Expected: 成功。

- [ ] **Step 9: Commit**

```bash
git add contracts/ control-plane/ frontend/
git -c user.name="evocode" -c user.email="evocode@local" commit -m "feat: propagate verification verdict across contract, gateway, frontend"
```

---

### Task 4: 端到端联调

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1-3。
- Produces: 文档化的验证裁定端到端证据。

- [ ] **Step 1: 启动 Python + Java（主会话管控，清 DB）**

- [ ] **Step 2: 带 repoPath 请求（clean fixture → 验证通过）**

```bash
curl -s -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"E:/evocode/test/fixtures/next-app"}'
```
Expected: verification.checked=true, passed=true, diagnosticCount=0。

- [ ] **Step 3: 不带 repoPath（checked=false）**

```bash
curl -s -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" -d '{"intent":"x","projectId":"y"}'
```
Expected: verification.checked=false。

- [ ] **Step 4: 停服务，清 DB，README 补验证 e2e（含诚实边界说明），Commit**

```bash
rm -f ai-runtime/data/pkg.db*
git add README.md
git -c user.name="evocode" -c user.email="evocode@local" commit -m "docs: increment 5 verified e2e — verification verdict in pipeline"
```

---

## Self-Review

**Spec coverage:** §3 check.js+TsVerifier→T1；§3 verify节点+图扩展→T2；§4 契约→T2(Pydantic)+T3(schema/Java/TS)；§6 测试→T1(verifier 3)+T2(verify_node 2)；§5 安全回退→T2(verify_node 多层 try)。✓
**Placeholder scan:** check.js/verifier 用 verify-notes.md 验证版逐字；各步含完整代码/命令。✓
**Type consistency:** VerificationResult{checked,passed,diagnosticCount,diagnostics} + Diagnostic{file,line,code,message} 四处镜像；Pydantic diagnosticCount alias。✓
**回退:** verify_node 无repoPath/不可用/VerificationError/任何异常 → not_checked，不影响 plan，/runs 绝不 500。增量1-4 的 46 测试 Step7 全跑。✓
**诚实定位:** 验证目标 repo 现状非生成改动；README 标注边界。check.js 复用 ts-extractor 依赖零额外安装。✓
**确定性/截断:** diagnostics 截断 20；噪声过滤 Python 侧固定码表。✓
