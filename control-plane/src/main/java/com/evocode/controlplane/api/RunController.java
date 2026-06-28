// api/RunController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;

// 注意：本端点当前无鉴权，仅供 localhost 使用。鉴权/RBAC 为后续增量。
@RestController
@RequestMapping("/api/runs")
public class RunController {

    private final RunStore store;
    private final PythonRuntimeClient runtimeClient;

    public RunController(RunStore store, PythonRuntimeClient runtimeClient) {
        this.store = store;
        this.runtimeClient = runtimeClient;
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

    /**
     * 批准当前审批门：让运行时从 checkpoint 越过该门到下一个门或完成，并刷新持久化记录。
     * plan gate 批准 → 生成 changeSet（仍不落盘，停在 diff gate）；
     * diff gate 批准 → 落盘并完成。
     * 幂等：对【已完成】的 run 再次调用会返回 200 + 当前 completed 结果（运行时 resume
     * 在无下一节点时幂等返回当前态），便于客户端在网络超时后安全重试。
     * 运行时返回 404（无 checkpoint）时透传为 404。
     */
    @PostMapping("/{runId}/approve")
    public ResponseEntity<RunResult> approve(@PathVariable String runId) {
        try {
            RunResult result = runtimeClient.resumeRun(runId);
            store.update(result);
            return ResponseEntity.ok(result);
        } catch (HttpClientErrorException.NotFound e) {
            return ResponseEntity.notFound().build();
        }
    }
}
