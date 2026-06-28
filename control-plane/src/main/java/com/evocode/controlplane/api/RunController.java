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
