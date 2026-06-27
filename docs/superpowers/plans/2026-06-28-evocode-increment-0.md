# EvoCode 增量 0 — 四层骨架与健康契约 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建容纳四层的多语言 monorepo 骨架，打通一条贯穿四层的健康契约：前端 → Spring Boot 网关 `/api/intents` → Python 运行时 `/runs` → 返回桩化 run 确认。

**Architecture:** FINAL 四层分布式架构（前端 React/Next.js → Spring Boot 控制平面 → Python AI 运行时 → 业务服务层），布局方案 A（各层语言原生工具链），跨层 REST/JSON。增量 0 仅打通连线，零业务行为。

**Tech Stack:** Next.js 15 + React 19 (pnpm) / Spring Boot 3.3 + JDK 21 (Maven) / FastAPI + Python 3.11 (venv) / JSON Schema 契约。

## Global Constraints

- 四层架构 FINAL，不得修改、不得塌缩成单语言/单文件。
- 依赖方向单向向下：`frontend → control-plane → ai-runtime → services`。
- 契约 `IntentRequest{intent:string, projectId:string}` / `RunAcknowledgement{runId:string(uuid), status:"accepted"|"rejected", message:string}`，三处镜像（TS/Java/Pydantic）须字段一致。
- 增量 0 无鉴权，仅本地；非本地暴露前必补 auth。
- 零业务行为：无 Agent/PKG/真实 LLM；业务服务层仅留接缝注释。
- Python 必须用 `python -m venv` 隔离到 3.11（环境 pip 绑在 3.13）。
- Java 包名 `com.evocode.controlplane`；Python 包 `evocode_runtime`。
- 端口：Python 8000，Java 8080，前端 3000。

---

### Task 1: 仓库骨架与契约

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `contracts/README.md`
- Create: `contracts/intent.schema.json`
- Create: `services/README.md`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `contracts/intent.schema.json` — 定义 `IntentRequest` 与 `RunAcknowledgement` 两个 schema，后续三层据此镜像。

- [ ] **Step 1: 写 `.gitignore`**

```gitignore
# Node
node_modules/
.next/
dist/
*.tsbuildinfo
# Java
target/
# Python
.venv/
__pycache__/
*.pyc
.pytest_cache/
# Env
.env
# OS
.DS_Store
```

- [ ] **Step 2: 写 `contracts/intent.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "EvoCode Intent Contracts",
  "definitions": {
    "IntentRequest": {
      "type": "object",
      "required": ["intent", "projectId"],
      "properties": {
        "intent": { "type": "string", "minLength": 1 },
        "projectId": { "type": "string", "minLength": 1 }
      }
    },
    "RunAcknowledgement": {
      "type": "object",
      "required": ["runId", "status", "message"],
      "properties": {
        "runId": { "type": "string", "format": "uuid" },
        "status": { "type": "string", "enum": ["accepted", "rejected"] },
        "message": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 3: 写 `contracts/README.md`**

内容说明：本目录是跨层契约的唯一事实来源；三处镜像位置分别为 `frontend/src/types/intent.ts`、`control-plane/.../dto/`、`ai-runtime/.../models.py`；任何契约变更须同步三处。

- [ ] **Step 4: 写 `services/README.md`**

内容说明：业务服务层占位。增量 0 不实现，后续承载验证引擎、图存储 (Postgres+pgvector)、沙箱运行器、目标仓库 I/O；接缝当前位于 `ai-runtime/src/evocode_runtime/services/`。

- [ ] **Step 5: 写根 `README.md`**

内容：项目简介、四层架构图、各层目录指引、本地启动顺序（Python → Java → 前端）。

- [ ] **Step 6: Commit**

```bash
git add README.md .gitignore contracts/ services/
git commit -m "chore: repo skeleton and cross-layer intent contract"
```

---

### Task 2: Python AI 运行时 (FastAPI)

**Files:**
- Create: `ai-runtime/pyproject.toml`
- Create: `ai-runtime/.env.example`
- Create: `ai-runtime/src/evocode_runtime/__init__.py`
- Create: `ai-runtime/src/evocode_runtime/models.py`
- Create: `ai-runtime/src/evocode_runtime/main.py`
- Create: `ai-runtime/src/evocode_runtime/services/__init__.py`
- Test: `ai-runtime/tests/test_health.py`

**Interfaces:**
- Consumes: `contracts/intent.schema.json` — 镜像为 Pydantic 模型。
- Produces:
  - `IntentRequest(intent: str, projectId: str)` — Pydantic 模型（alias 兼容驼峰）。
  - `RunAcknowledgement(runId: str, status: str, message: str)`。
  - HTTP: `GET /health` → `{"status":"ok"}`；`POST /runs`（body=IntentRequest）→ `RunAcknowledgement`，`runId=uuid4()`，`status="accepted"`。

- [ ] **Step 1: 写 `pyproject.toml`**

```toml
[project]
name = "evocode-runtime"
version = "0.0.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi==0.115.6",
  "uvicorn[standard]==0.34.0",
  "pydantic==2.10.4",
]

[project.optional-dependencies]
dev = ["pytest==8.3.4", "httpx==0.28.1"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: 写 `models.py`**

```python
from uuid import uuid4
from pydantic import BaseModel, Field, ConfigDict


class IntentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    intent: str = Field(min_length=1)
    project_id: str = Field(min_length=1, alias="projectId")


class RunAcknowledgement(BaseModel):
    run_id: str = Field(alias="runId")
    status: str
    message: str

    @staticmethod
    def accept(message: str = "Intent accepted") -> "RunAcknowledgement":
        return RunAcknowledgement(runId=str(uuid4()), status="accepted", message=message)
```

- [ ] **Step 3: 写 `services/__init__.py`（接缝）**

```python
"""业务服务层接缝。

增量 0 不实现。后续此处接入：
- LangGraph Agent 编排 (RunRuntime)
- 项目知识图谱 (PKG) 查询
- 验证引擎 (build/lint/test 沙箱)
真实 GraphMutation → ChangeSet → 验证 闭环将由此驱动。
"""
```

- [ ] **Step 4: 写 `main.py`**

```python
from fastapi import FastAPI
from evocode_runtime.models import IntentRequest, RunAcknowledgement

app = FastAPI(title="EvoCode AI Runtime", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs", response_model=RunAcknowledgement, response_model_by_alias=True)
def create_run(req: IntentRequest) -> RunAcknowledgement:
    # 增量 0：桩化确认。真实演化事务后续接入 services 层。
    return RunAcknowledgement.accept(f"Run accepted for project {req.project_id}")
```

- [ ] **Step 5: 写 `__init__.py`**

```python
__version__ = "0.0.0"
```

- [ ] **Step 6: 写失败测试 `tests/test_health.py`**

```python
from fastapi.testclient import TestClient
from evocode_runtime.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_create_run_returns_accepted():
    resp = client.post("/runs", json={"intent": "add a contact page", "projectId": "demo"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["runId"]
    assert "demo" in body["message"]
```

- [ ] **Step 7: 创建 venv 并安装（隔离到 3.11）**

```bash
cd ai-runtime
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```
Expected: 安装成功，无版本冲突。

- [ ] **Step 8: 跑测试，验证通过**

Run: `cd ai-runtime && .venv/Scripts/python -m pytest -v`
Expected: 2 passed。

- [ ] **Step 9: 验证可启动**

Run: `cd ai-runtime && .venv/Scripts/python -m uvicorn evocode_runtime.main:app --port 8000 &` 然后 `curl http://localhost:8000/health`
Expected: `{"status":"ok"}`。验证后停掉进程。

- [ ] **Step 10: 写 `.env.example`**

```
RUNTIME_PORT=8000
```

- [ ] **Step 11: Commit**

```bash
git add ai-runtime/
git commit -m "feat(ai-runtime): FastAPI skeleton with /health and stubbed /runs"
```

---

### Task 3: Spring Boot 控制平面 (Maven)

**Files:**
- Create: `control-plane/pom.xml`
- Create: `control-plane/src/main/resources/application.yml`
- Create: `control-plane/src/main/java/com/evocode/controlplane/ControlPlaneApplication.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/IntentRequest.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/dto/RunAcknowledgement.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/client/PythonRuntimeClient.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/api/IntentController.java`
- Test: `control-plane/src/test/java/com/evocode/controlplane/ControlPlaneApplicationTests.java`

**Interfaces:**
- Consumes:
  - `contracts/intent.schema.json` — 镜像为 Java record DTO。
  - Python `POST /runs` → `RunAcknowledgement`（经 `PythonRuntimeClient` 调用）。
- Produces:
  - HTTP: `GET /actuator/health`（Actuator 提供）；`POST /api/intents`（body=IntentRequest）→ 转发 Python 并回传 `RunAcknowledgement`。
  - `python.runtime.base-url` 配置项（默认 `http://localhost:8000`）。

- [ ] **Step 1: 写 `pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.7</version>
    <relativePath/>
  </parent>
  <groupId>com.evocode</groupId>
  <artifactId>control-plane</artifactId>
  <version>0.0.0</version>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

- [ ] **Step 2: 写 `application.yml`**

```yaml
server:
  port: 8080
python:
  runtime:
    base-url: http://localhost:8000
management:
  endpoints:
    web:
      exposure:
        include: health
```

- [ ] **Step 3: 写 `ControlPlaneApplication.java`**

```java
package com.evocode.controlplane;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ControlPlaneApplication {
    public static void main(String[] args) {
        SpringApplication.run(ControlPlaneApplication.class, args);
    }
}
```

- [ ] **Step 4: 写 DTO `IntentRequest.java`**

```java
package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

public record IntentRequest(
    @NotBlank String intent,
    @NotBlank String projectId
) {}
```

- [ ] **Step 5: 写 DTO `RunAcknowledgement.java`**

```java
package com.evocode.controlplane.dto;

public record RunAcknowledgement(
    String runId,
    String status,
    String message
) {}
```

- [ ] **Step 6: 写 `PythonRuntimeClient.java`**

```java
package com.evocode.controlplane.client;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunAcknowledgement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class PythonRuntimeClient {

    private final RestClient restClient;

    public PythonRuntimeClient(@Value("${python.runtime.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public RunAcknowledgement createRun(IntentRequest request) {
        return restClient.post()
            .uri("/runs")
            .body(request)
            .retrieve()
            .body(RunAcknowledgement.class);
    }
}
```

- [ ] **Step 7: 写 `IntentController.java`**

```java
package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunAcknowledgement;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intents")
public class IntentController {

    private final PythonRuntimeClient runtimeClient;

    public IntentController(PythonRuntimeClient runtimeClient) {
        this.runtimeClient = runtimeClient;
    }

    @PostMapping
    public RunAcknowledgement submit(@Valid @RequestBody IntentRequest request) {
        // 增量 0：直转 Python 运行时。后续此处接入编排/鉴权/RBAC。
        return runtimeClient.createRun(request);
    }
}
```

- [ ] **Step 8: 写测试 `ControlPlaneApplicationTests.java`**

```java
package com.evocode.controlplane;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ControlPlaneApplicationTests {
    @Test
    void contextLoads() {
    }
}
```

- [ ] **Step 9: 编译，验证通过**

Run: `cd control-plane && mvn -q compile`
Expected: BUILD SUCCESS。

- [ ] **Step 10: 跑测试，验证 context 加载**

Run: `cd control-plane && mvn -q test`
Expected: BUILD SUCCESS，contextLoads 通过。

- [ ] **Step 11: Commit**

```bash
git add control-plane/
git commit -m "feat(control-plane): Spring Boot gateway forwarding intents to Python runtime"
```

---

### Task 4: 前端控制台 (Next.js)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.mjs`
- Create: `frontend/tsconfig.json`
- Create: `frontend/.env.example`
- Create: `frontend/src/types/intent.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes:
  - `contracts/intent.schema.json` — 镜像为 TS 接口。
  - Java `POST /api/intents` → `RunAcknowledgement`。
- Produces: 一个页面，提交 intent + projectId，调网关并渲染 `RunAcknowledgement`。读 `NEXT_PUBLIC_CONTROL_PLANE_URL`。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "@evocode/frontend",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.1.3",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "@types/react": "19.0.2",
    "@types/node": "22.10.2"
  }
}
```

- [ ] **Step 2: 写 `next.config.mjs`**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: 写 `src/types/intent.ts`**

```typescript
// 镜像 contracts/intent.schema.json
export interface IntentRequest {
  intent: string;
  projectId: string;
}

export interface RunAcknowledgement {
  runId: string;
  status: "accepted" | "rejected";
  message: string;
}
```

- [ ] **Step 5: 写 `src/lib/api.ts`**

```typescript
import type { IntentRequest, RunAcknowledgement } from "@/types/intent";

const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? "http://localhost:8080";

export async function submitIntent(req: IntentRequest): Promise<RunAcknowledgement> {
  const resp = await fetch(`${BASE}/api/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!resp.ok) throw new Error(`Control plane error: ${resp.status}`);
  return resp.json();
}
```

- [ ] **Step 6: 写 `src/app/layout.tsx`**

```tsx
export const metadata = { title: "EvoCode Console" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: 写 `src/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { submitIntent } from "@/lib/api";
import type { RunAcknowledgement } from "@/types/intent";

export default function Home() {
  const [intent, setIntent] = useState("");
  const [projectId, setProjectId] = useState("demo");
  const [result, setResult] = useState<RunAcknowledgement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResult(await submitIntent({ intent, projectId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>EvoCode Console</h1>
      <form onSubmit={onSubmit}>
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="projectId" />
        <textarea value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Describe your intent..." rows={4} style={{ width: "100%" }} />
        <button type="submit" disabled={!intent}>Submit Intent</button>
      </form>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 8: 写 `.env.example`**

```
NEXT_PUBLIC_CONTROL_PLANE_URL=http://localhost:8080
```

- [ ] **Step 9: 安装依赖**

Run: `cd frontend && pnpm install`
Expected: 安装成功。

- [ ] **Step 10: 构建，验证类型与编译**

Run: `cd frontend && pnpm build`
Expected: 构建成功，无类型错误。

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): Next.js console page submitting intents to control plane"
```

---

### Task 5: 端到端联调验证

**Files:**
- Modify: `README.md`（补充验证过的启动顺序与 curl 示例）

**Interfaces:**
- Consumes: Task 2/3/4 全部产出。
- Produces: 文档化的端到端验证证据。

- [ ] **Step 1: 启动 Python 运行时**

Run: `cd ai-runtime && .venv/Scripts/python -m uvicorn evocode_runtime.main:app --port 8000 &`
Expected: 监听 8000。

- [ ] **Step 2: 启动 Java 控制平面**

Run: `cd control-plane && mvn -q spring-boot:run &`
Expected: 监听 8080。

- [ ] **Step 3: 验证 Java 健康**

Run: `curl http://localhost:8080/actuator/health`
Expected: `{"status":"UP"}`。

- [ ] **Step 4: 端到端验证意图转发**

Run: `curl -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" -d '{"intent":"add a contact page","projectId":"demo"}'`
Expected: 返回 JSON，含 `"status":"accepted"`、非空 `runId`、message 含 `demo`。

- [ ] **Step 5: 停止后台进程**

停掉 uvicorn 与 spring-boot 进程。

- [ ] **Step 6: 把验证过的启动顺序与 curl 示例补进 `README.md`，Commit**

```bash
git add README.md
git commit -m "docs: verified end-to-end startup and curl example"
```

---

## Self-Review

**1. Spec coverage:** 
- §3 布局 → Task 1（骨架）+ 各层任务的目录。✓
- §4 契约三处镜像 → Task 1（schema）、Task 2（Pydantic）、Task 3（Java DTO）、Task 4（TS）。✓
- §5 各层职责 → Task 2/3/4。✓
- §2 验收 5 条 → Task 2(Step8-9)、Task 3(Step9-10)、Task 4(Step10)、Task 5(端到端)、Task 1(git)。✓
- §7 测试运行器 → Task 2(pytest)、Task 3(JUnit)。✓
- 业务服务接缝 → Task 1(services/README) + Task 2(services/__init__.py)。✓

**2. Placeholder scan:** 各步均含完整代码/命令，无 TBD/TODO（仅代码内注释标注“后续接入”，属设计意图，非计划占位）。✓

**3. Type consistency:** 契约字段 `intent`/`projectId`/`runId`/`status`/`message` 在 JSON Schema、Pydantic(alias)、Java record、TS interface 四处一致；Python 用 `alias="projectId"` + `by_alias` 输出保证驼峰对齐 Java/TS。✓

**4. 风险点:** Windows 下 venv 路径为 `.venv/Scripts/python`（已在命令中使用，非 Unix 的 `bin/`）。✓
