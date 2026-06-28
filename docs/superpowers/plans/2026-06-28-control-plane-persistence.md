# Control Plane Run 持久化 + 历史查询 实现计划

> **For agentic workers:** 用 superpowers:subagent-driven-development 逐任务执行。步骤用 `- [ ]` 跟踪。

**目标：** 让 Spring Boot Control Plane 持久化每一次 Run（JPA + H2 文件库），提供历史查询/详情端点，并让前端控制台展示运行历史——把它从无状态转发器变成有记忆的平台。

**架构：** 在 `IntentController.submit` 转发 Python 运行时的前后，写入一条 `RunRecord`。采用**混合持久化**：标量列（runId/projectId/intent/status/phase/message/createdAt）用于列表与查询，完整 `RunResult` 用 Jackson 序列化为 JSON 存 `@Lob` 文本列——避免为 taskGraph/changeSet/review 等嵌套结构建整套 JPA 实体。新增 `GET /api/runs`（分页列表，最近优先）与 `GET /api/runs/{runId}`（取回完整 RunResult）。前端控制台加一个"历史"区，列出最近 Run，点击载入详情。Python 运行时、契约 schema 不变（持久化是 Control Plane 内部职责）。

**技术栈：** Spring Boot 3.3.7 + Spring Data JPA + H2（文件模式）+ Jackson；Java 21 record/entity。前端 Next.js 15 + 既有 shadcn 控制台。

## Global Constraints

- **不破坏现有端到端流**：`POST /api/intents` 行为不变（仍返回同一个 RunResult），持久化是旁路副作用；即使写库失败也绝不让 `/api/intents` 失败（吞掉持久化异常并记录日志）。
- **离线友好**：H2 用文件模式（`jdbc:h2:file:./data/evocode`），无需外部数据库；新增依赖 `spring-boot-starter-data-jpa` + `com.h2database:h2`（已确认可拉取）。
- **数据目录忽略**：H2 库文件落在 `control-plane/data/`，加入 `.gitignore`。
- **契约一致**：前端消费的 RunResult 形态不变（`@/types/intent` 已含全部字段）；新增的列表项类型 `RunSummary` 在前端 types 里新增，对应 Java 的 `RunSummary` record。
- **必须编译+测试**：每个 Java 任务跑 `mvn -q test`（或 compile）；前端跑 `npx tsc --noEmit` + `npx next build`，均须通过。
- **安全提示**：本增量不加鉴权——`/api/runs*` 当前无访问控制，仅 localhost。在 controller 注释与计划中明确标注这是已知限制（鉴权是后续增量）。
- **不回退**：现有控制台 `/console`、落地页 `/`、shadcn token 体系不得回退。

---

### Task 1: 加 JPA + H2 依赖与数据源配置

**Files:**
- Modify: `control-plane/pom.xml`
- Modify: `control-plane/src/main/resources/application.yml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: 可用的 JPA 运行环境（H2 文件库 `./data/evocode`），`ddl-auto: update` 自动建表。

- [ ] **Step 1: pom.xml 加依赖**

在 `<dependencies>` 内加：

```xml
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>com.h2database</groupId>
      <artifactId>h2</artifactId>
      <scope>runtime</scope>
    </dependency>
```

- [ ] **Step 2: application.yml 配数据源**

追加（保留现有 server/python/management 配置）：

```yaml
spring:
  datasource:
    url: jdbc:h2:file:./data/evocode;DB_CLOSE_ON_EXIT=FALSE
    driver-class-name: org.h2.Driver
    username: sa
    password: ""
  jpa:
    hibernate:
      ddl-auto: update
    properties:
      hibernate.format_sql: false
    open-in-view: false
```

- [ ] **Step 3: .gitignore 加 H2 数据目录**

在 `.gitignore` 追加：

```
# H2
control-plane/data/
```

- [ ] **Step 4: 验证依赖解析 + 编译**

Run: `cd control-plane && mvn -q compile`
Expected: BUILD SUCCESS（首次会联网下载 jpa/h2/hibernate）。

- [ ] **Step 5: Commit**

```bash
git add control-plane/pom.xml control-plane/src/main/resources/application.yml .gitignore
git commit -m "build(control-plane): 加 Spring Data JPA + H2 文件库与数据源配置"
```

---

### Task 2: RunRecord 实体 + Repository + 持久化（含序列化测试）

**Files:**
- Create: `control-plane/src/main/java/com/evocode/controlplane/persistence/RunRecord.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/persistence/RunRepository.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/persistence/RunStore.java`（封装 save/list/get + JSON 序列化）
- Create: `control-plane/src/test/java/com/evocode/controlplane/RunStoreTest.java`

**Interfaces:**
- Produces:
  - `RunRecord`（JPA entity）：`id`(auto)、`runId`(unique)、`projectId`、`intent`(@Lob)、`status`、`phase`、`message`(@Lob)、`resultJson`(@Lob，完整 RunResult 的 JSON)、`createdAt`(Instant)。
  - `RunRepository extends JpaRepository<RunRecord, Long>`：`findByRunId(String)`、`findAllByOrderByCreatedAtDesc(Pageable)`。
  - `RunStore`：`void save(IntentRequest req, RunResult result)`（序列化 result→json，建 RunRecord 存库）、`List<RunSummary> list(int limit)`、`Optional<RunResult> get(String runId)`（反序列化 json→RunResult）。
  - `RunSummary`（record）：`runId, projectId, intent, status, phase, message, createdAt`。

- [ ] **Step 1: 写失败测试（先定义行为）**

```java
// control-plane/src/test/java/com/evocode/controlplane/RunStoreTest.java
package com.evocode.controlplane;

import com.evocode.controlplane.dto.*;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class RunStoreTest {

    @Autowired
    RunStore store;

    private RunResult sampleResult(String runId) {
        return new RunResult(
            runId, "completed", "reviewed",
            new TaskGraph(List.of(new EngineeringTask("t1", "前端页面", "frontend", "做页面"))),
            null, List.of(), List.of(), null,
            new ReviewOutput("approve", List.of(), "ok"),
            "done");
    }

    @Test
    void save_then_get_roundtrips_full_result() {
        var req = new IntentRequest("加联系页", "demo", null);
        store.save(req, sampleResult("run-rt-1"));

        Optional<RunResult> got = store.get("run-rt-1");
        assertTrue(got.isPresent());
        assertEquals("reviewed", got.get().phase());
        assertEquals("approve", got.get().review().verdict());
        assertEquals(1, got.get().taskGraph().tasks().size());
    }

    @Test
    void list_returns_recent_first_with_summary_fields() {
        store.save(new IntentRequest("意图A", "projA", null), sampleResult("run-list-a"));
        store.save(new IntentRequest("意图B", "projB", null), sampleResult("run-list-b"));

        List<RunSummary> runs = store.list(10);
        assertTrue(runs.size() >= 2);
        // 最近优先：run-list-b 应排在 run-list-a 之前
        int idxA = -1, idxB = -1;
        for (int i = 0; i < runs.size(); i++) {
            if (runs.get(i).runId().equals("run-list-a")) idxA = i;
            if (runs.get(i).runId().equals("run-list-b")) idxB = i;
        }
        assertTrue(idxB < idxA, "最近的 run-list-b 应排在前");
        RunSummary b = runs.get(idxB);
        assertEquals("projB", b.projectId());
        assertEquals("意图B", b.intent());
        assertEquals("completed", b.status());
    }

    @Test
    void get_unknown_runId_returns_empty() {
        assertTrue(store.get("does-not-exist").isEmpty());
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd control-plane && mvn -q -Dtest=RunStoreTest test`
Expected: 编译失败（RunStore/RunSummary 等类不存在）。

- [ ] **Step 3: 写 RunRecord 实体**

```java
// persistence/RunRecord.java
package com.evocode.controlplane.persistence;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "run_record", indexes = @Index(name = "idx_run_id", columnList = "runId", unique = true))
public class RunRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String runId;

    private String projectId;

    @Lob
    private String intent;

    private String status;
    private String phase;

    @Lob
    private String message;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String resultJson;

    @Column(nullable = false)
    private Instant createdAt;

    protected RunRecord() {}  // JPA

    public RunRecord(String runId, String projectId, String intent, String status,
                     String phase, String message, String resultJson, Instant createdAt) {
        this.runId = runId;
        this.projectId = projectId;
        this.intent = intent;
        this.status = status;
        this.phase = phase;
        this.message = message;
        this.resultJson = resultJson;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getRunId() { return runId; }
    public String getProjectId() { return projectId; }
    public String getIntent() { return intent; }
    public String getStatus() { return status; }
    public String getPhase() { return phase; }
    public String getMessage() { return message; }
    public String getResultJson() { return resultJson; }
    public Instant getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 4: 写 RunSummary record**

```java
// persistence/RunSummary.java
package com.evocode.controlplane.persistence;

import java.time.Instant;

public record RunSummary(
    String runId,
    String projectId,
    String intent,
    String status,
    String phase,
    String message,
    Instant createdAt
) {}
```

- [ ] **Step 5: 写 RunRepository**

```java
// persistence/RunRepository.java
package com.evocode.controlplane.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface RunRepository extends JpaRepository<RunRecord, Long> {
    Optional<RunRecord> findByRunId(String runId);
    List<RunRecord> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
```

- [ ] **Step 6: 写 RunStore**

```java
// persistence/RunStore.java
package com.evocode.controlplane.persistence;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class RunStore {

    private static final Logger log = LoggerFactory.getLogger(RunStore.class);

    private final RunRepository repo;
    private final ObjectMapper mapper;

    public RunStore(RunRepository repo, ObjectMapper mapper) {
        this.repo = repo;
        this.mapper = mapper;
    }

    /** 持久化一次运行。序列化失败时记录日志但不抛出（绝不拖垮 /api/intents）。 */
    public void save(IntentRequest req, RunResult result) {
        try {
            String json = mapper.writeValueAsString(result);
            RunRecord rec = new RunRecord(
                result.runId(), req.projectId(), req.intent(),
                result.status(), result.phase(), result.message(),
                json, Instant.now());
            repo.save(rec);
        } catch (Exception e) {  // 序列化或写库异常都吞掉
            log.warn("RunStore.save failed for runId={}", result.runId(), e);
        }
    }

    public List<RunSummary> list(int limit) {
        return repo.findAllByOrderByCreatedAtDesc(PageRequest.of(0, limit)).stream()
            .map(r -> new RunSummary(r.getRunId(), r.getProjectId(), r.getIntent(),
                r.getStatus(), r.getPhase(), r.getMessage(), r.getCreatedAt()))
            .toList();
    }

    public Optional<RunResult> get(String runId) {
        return repo.findByRunId(runId).flatMap(r -> {
            try {
                return Optional.of(mapper.readValue(r.getResultJson(), RunResult.class));
            } catch (Exception e) {
                log.warn("RunStore.get deserialize failed for runId={}", runId, e);
                return Optional.empty();
            }
        });
    }
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cd control-plane && mvn -q -Dtest=RunStoreTest test`
Expected: 3 个测试通过。

- [ ] **Step 8: Commit**

```bash
git add control-plane/src/main/java/com/evocode/controlplane/persistence control-plane/src/test/java/com/evocode/controlplane/RunStoreTest.java
git commit -m "feat(control-plane): RunRecord 实体 + RunStore 混合持久化（标量列 + RunResult JSON）"
```

---

### Task 3: 持久化接入 submit + 历史查询端点

**Files:**
- Modify: `control-plane/src/main/java/com/evocode/controlplane/api/IntentController.java`
- Create: `control-plane/src/main/java/com/evocode/controlplane/api/RunController.java`
- Create: `control-plane/src/test/java/com/evocode/controlplane/RunControllerTest.java`

**Interfaces:**
- Consumes: `RunStore`（Task 2）。
- Produces:
  - `IntentController.submit`：转发后调用 `runStore.save(request, result)`，再返回 result（行为不变）。
  - `GET /api/runs?limit=20` → `List<RunSummary>`（最近优先）。
  - `GET /api/runs/{runId}` → `RunResult`（404 若不存在）。

- [ ] **Step 1: 写 RunController 的 WebMvc 测试**

```java
// control-plane/src/test/java/com/evocode/controlplane/RunControllerTest.java
package com.evocode.controlplane;

import com.evocode.controlplane.api.RunController;
import com.evocode.controlplane.dto.*;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RunController.class)
class RunControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean RunStore store;

    @Test
    void list_returns_summaries() throws Exception {
        when(store.list(20)).thenReturn(List.of(
            new RunSummary("r1", "demo", "意图1", "completed", "reviewed", "done", Instant.now())));
        mvc.perform(get("/api/runs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].runId").value("r1"))
            .andExpect(jsonPath("$[0].projectId").value("demo"));
    }

    @Test
    void get_existing_returns_result() throws Exception {
        when(store.get(eq("r1"))).thenReturn(Optional.of(new RunResult(
            "r1", "completed", "reviewed",
            new TaskGraph(List.of()), null, List.of(), List.of(), null, null, "done")));
        mvc.perform(get("/api/runs/r1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.runId").value("r1"))
            .andExpect(jsonPath("$.phase").value("reviewed"));
    }

    @Test
    void get_missing_returns_404() throws Exception {
        when(store.get(eq("nope"))).thenReturn(Optional.empty());
        mvc.perform(get("/api/runs/nope")).andExpect(status().isNotFound());
    }
}
```

注：`@MockitoBean` 是 Spring Boot 3.3 替代 `@MockBean` 的注解（`org.springframework.test.context.bean.override.mockito.MockitoBean`）。若该版本无此注解，回退用 `@MockBean`（`org.springframework.boot.test.mock.mockito.MockBean`）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd control-plane && mvn -q -Dtest=RunControllerTest test`
Expected: 编译失败（RunController 不存在）。

- [ ] **Step 3: 写 RunController**

```java
// api/RunController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// 注意：本端点当前无鉴权，仅供 localhost 使用。鉴权/RBAC 为后续增量。
@RestController
@RequestMapping("/api/runs")
public class RunController {

    private final RunStore store;

    public RunController(RunStore store) {
        this.store = store;
    }

    @GetMapping
    public List<RunSummary> list(@RequestParam(defaultValue = "20") int limit) {
        return store.list(Math.min(Math.max(limit, 1), 100));
    }

    @GetMapping("/{runId}")
    public ResponseEntity<RunResult> get(@PathVariable String runId) {
        return store.get(runId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
}
```

- [ ] **Step 4: IntentController 接入持久化**

```java
// api/IntentController.java —— 修改
package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/intents")
public class IntentController {

    private final PythonRuntimeClient runtimeClient;
    private final RunStore runStore;

    public IntentController(PythonRuntimeClient runtimeClient, RunStore runStore) {
        this.runtimeClient = runtimeClient;
        this.runStore = runStore;
    }

    @PostMapping
    public RunResult submit(@Valid @RequestBody IntentRequest request) {
        RunResult result = runtimeClient.createRun(request);
        runStore.save(request, result);  // 旁路持久化；save 内部已吞异常
        return result;
    }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd control-plane && mvn -q -Dtest=RunControllerTest test`
Expected: 3 个测试通过。

- [ ] **Step 6: 全量测试**

Run: `cd control-plane && mvn -q test`
Expected: 所有测试（contextLoads + RunStoreTest + RunControllerTest）通过。

- [ ] **Step 7: Commit**

```bash
git add control-plane/src/main/java/com/evocode/controlplane/api control-plane/src/test/java/com/evocode/controlplane/RunControllerTest.java
git commit -m "feat(control-plane): submit 旁路持久化 + GET /api/runs 历史列表与详情端点"
```

---

### Task 4: 前端契约镜像 + API 封装

**Files:**
- Modify: `frontend/src/types/intent.ts`（加 `RunSummary`）
- Modify: `frontend/src/lib/api.ts`（加 `listRuns`、`getRun`）

**Interfaces:**
- Produces:
  - TS `RunSummary { runId, projectId, intent, status, phase, message, createdAt }`（createdAt 为 ISO 字符串）。
  - `listRuns(limit?): Promise<RunSummary[]>` → `GET /api/runs`。
  - `getRun(runId): Promise<RunResult>` → `GET /api/runs/{runId}`（404 抛 ControlPlaneError）。

- [ ] **Step 1: types 加 RunSummary**

在 `frontend/src/types/intent.ts` 末尾加：

```typescript
export interface RunSummary {
  runId: string;
  projectId: string;
  intent: string;
  status: string;
  phase: string;
  message: string;
  createdAt: string; // ISO-8601
}
```

- [ ] **Step 2: api.ts 加查询函数**

在 `frontend/src/lib/api.ts` 加（复用现有 BASE 与 ControlPlaneError）：

```typescript
import type { IntentRequest, RunResult, RunSummary } from "@/types/intent";

export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const resp = await fetch(`${BASE}/api/runs?limit=${limit}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}

export async function getRun(runId: string): Promise<RunResult> {
  const resp = await fetch(`${BASE}/api/runs/${encodeURIComponent(runId)}`);
  if (!resp.ok) throw new ControlPlaneError(resp.status);
  return resp.json();
}
```

（注意：把 `RunSummary` 加进现有 import 行。）

- [ ] **Step 3: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/intent.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): RunSummary 类型 + listRuns/getRun API 封装"
```

---

### Task 5: 控制台历史区 + 详情载入

**Files:**
- Create: `frontend/src/components/console/RunHistory.tsx`
- Modify: `frontend/src/app/console/page.tsx`

**Interfaces:**
- Consumes: `listRuns`, `getRun`, `RunSummary`, `RunResult`；shadcn Card/Button/Badge/ScrollArea；lucide。
- Produces:
  - `RunHistory`：props `{ onSelect: (runId:string)=>void, refreshKey: number }`。挂载/refreshKey 变化时 `listRuns()` 拉取，渲染最近 Run 列表（每项：intent 截断 + projectId + status Badge + 相对时间）。点击项调 `onSelect(runId)`。空/失败有占位文案。
  - `page.tsx`：提交成功后 `refreshKey++` 触发历史刷新；历史项点击 → `getRun(runId)` → `setResult`。历史区放在工作台合适位置（如结果区下方或侧）。

- [ ] **Step 1: 写 RunHistory**

```tsx
"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { listRuns } from "@/lib/api";
import type { RunSummary } from "@/types/intent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RunHistory({ onSelect, refreshKey }: { onSelect: (runId: string) => void; refreshKey: number }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listRuns(20)
      .then((r) => { if (active) { setRuns(r); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" aria-hidden="true" /> 运行历史
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-sm text-muted-foreground">无法加载历史，请确认控制平面已启动。</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有运行记录。提交一个意图后会出现在这里。</p>
        ) : (
          runs.map((r) => (
            <button
              key={r.runId}
              onClick={() => onSelect(r.runId)}
              className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 truncate">{r.intent}</span>
              <Badge variant={r.status === "completed" ? "default" : "destructive"}>{r.phase}</Badge>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: page.tsx 接入历史**

在 `console/page.tsx`：加 `const [refreshKey, setRefreshKey] = useState(0);`，提交成功 `setResult(r)` 后 `setRefreshKey(k=>k+1)`；新增 `async function loadRun(runId){ try { setResult(await getRun(runId)); } catch { toast.error("无法载入该运行记录"); } }`。在布局里渲染 `<RunHistory onSelect={loadRun} refreshKey={refreshKey} />`（放在 IntentForm 下方或结果区旁，单列即可）。import `getRun`。

- [ ] **Step 3: 验证编译 + 构建**

Run: `cd frontend && npx tsc --noEmit && npx next build`
Expected: 通过，`/console` 生成。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/console/RunHistory.tsx frontend/src/app/console/page.tsx
git commit -m "feat(frontend): 控制台运行历史区 + 历史详情载入"
```

---

### Task 6: 端到端验证 + 文档更新

**Files:**
- Modify: `README.md`（补 /api/runs 端点与持久化说明）
- Modify: `docs/architecture/control-plane-architecture.md`（更新实现状态：Run 持久化已建）
- Modify: `contracts/README.md`（如适用，记 RunSummary）

**Interfaces:** 无新代码，验证 + 文档。

- [ ] **Step 1: 启动后端跑端到端（如环境允许）**

启动顺序：Python `:8000`、Spring Boot `:8080`。
```bash
curl -X POST http://localhost:8080/api/intents -H "Content-Type: application/json" -d '{"intent":"加联系页","projectId":"demo"}'
curl http://localhost:8080/api/runs            # 应含刚才的 run，最近优先
curl http://localhost:8080/api/runs/<runId>    # 应返回完整 RunResult
```
Expected: list 含新 run；detail 返回完整结果；重启 Spring Boot 后 list 仍在（文件库持久）。若本环境无法长时间起服务，则以 `mvn test` 通过 + 手动核对端点定义为准，并在报告中说明。

- [ ] **Step 2: 更新 README**

在 README 的端点说明处补：`GET /api/runs`（历史列表）、`GET /api/runs/{runId}`（详情）；说明 Control Plane 现用 H2 文件库持久化每次 Run（`control-plane/data/`），重启不丢；标注当前无鉴权、仅 localhost。

- [ ] **Step 3: 更新 control-plane-architecture.md 实现状态**

把"Run 状态持久化"从 📋计划中 移到 ✅已构建（H2 + JPA，混合持久化），保留鉴权/多租户/Redis 等仍为计划中。

- [ ] **Step 4: 全量回归**

Run: `cd control-plane && mvn -q test` 和 `cd frontend && npx next build`
Expected: 均通过。

- [ ] **Step 5: Commit**

```bash
git add README.md docs/architecture/control-plane-architecture.md contracts/README.md
git commit -m "docs: 记录 Run 持久化与 /api/runs 端点，更新实现状态"
```

---

## Self-Review

**1. 覆盖：** JPA+H2 依赖（T1）✓；实体+持久化+测试（T2）✓；端点+接入+测试（T3）✓；前端契约+API（T4）✓；前端历史 UI（T5）✓；端到端+文档（T6）✓。

**2. 占位扫描：** 各步含完整代码或精确契约，无 TBD。T6 Step1 端到端给了回退（环境不允许长跑服务时以测试+端点定义为准）。

**3. 类型一致：** `RunSummary` 字段在 Java record（T2）、前端 interface（T4）、RunHistory 消费（T5）三处一致（runId/projectId/intent/status/phase/message/createdAt）。`RunStore.save/list/get` 签名在 T2 定义，T3 controller 与 IntentController 按此调用。`RunResult` 形态不变，JSON 序列化往返由 RunStoreTest 验证。

**4. 风险点：**
- 首次构建需联网下载 jpa/h2/hibernate（已验证可拉取）。
- `@Lob String` 在 H2 需 `columnDefinition="CLOB"` 避免被建成超短列——T2 已指定。
- `@MockitoBean` vs `@MockBean`：Spring Boot 3.3.7 支持 `@MockitoBean`，T3 已注明回退方案。
- `open-in-view: false` 避免懒加载陷阱；RunStore 在事务边界内完成序列化，get 时 resultJson 已是普通字段，无懒加载问题。
- 持久化失败不影响 `/api/intents`（save 内吞异常）——契约：现有端到端流绝不因持久化回归。
- H2 文件库 `control-plane/data/` 已加 .gitignore，不会误提交。
