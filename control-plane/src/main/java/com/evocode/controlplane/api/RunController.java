// api/RunController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.auth.AuthPrincipal;
import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpClientErrorException;

import java.util.List;

/**
 * Run 查询与审批，按当前用户所有权隔离：
 *   - list 仅本人运行（ADMIN 全部）
 *   - get/approve 非属主一律 404（遗留无属主记录仅 ADMIN 可见）
 * 鉴权由 SecurityConfig 保证。
 */
@RestController
@RequestMapping("/api/runs")
public class RunController {

    private final RunStore store;
    private final PythonRuntimeClient runtimeClient;

    public RunController(RunStore store, PythonRuntimeClient runtimeClient) {
        this.store = store;
        this.runtimeClient = runtimeClient;
    }

    /** 当前用户是否可访问该 run（属主匹配或 ADMIN）。 */
    private boolean canAccess(String runId, AuthPrincipal me) {
        if (me.isAdmin()) return store.get(runId).isPresent();
        return store.ownerOf(runId).filter(me.userId()::equals).isPresent();
    }

    @GetMapping
    public List<RunSummary> list(@RequestParam(defaultValue = "20") int limit,
                                 @RequestParam(required = false) String sessionId,
                                 @AuthenticationPrincipal AuthPrincipal me) {
        int capped = Math.min(Math.max(limit, 1), 100);
        if (sessionId != null) {
            // 会话运行历史：ADMIN 不限属主，USER 仅本人——会话本身已属主隔离。
            return me.isAdmin()
                ? store.listBySession(sessionId, capped)
                : store.listByOwnerAndSession(me.userId(), sessionId, capped);
        }
        return me.isAdmin() ? store.list(capped) : store.listByOwner(me.userId(), capped);
    }

    @GetMapping("/{runId}")
    public ResponseEntity<RunResult> get(@PathVariable String runId,
                                         @AuthenticationPrincipal AuthPrincipal me) {
        if (!canAccess(runId, me)) return ResponseEntity.notFound().build();
        return store.get(runId)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 批准当前审批门：让运行时从 checkpoint 越过该门到下一个门或完成，并刷新持久化记录。
     * 仅属主/ADMIN 可批准（非属主 404）。
     * 幂等：对已完成 run 再次调用返回 200 + 当前 completed 结果。
     * 运行时返回 404（无 checkpoint）时透传为 404。
     */
    @PostMapping("/{runId}/approve")
    public ResponseEntity<RunResult> approve(@PathVariable String runId,
                                             @AuthenticationPrincipal AuthPrincipal me) {
        if (!canAccess(runId, me)) return ResponseEntity.notFound().build();
        try {
            RunResult result = runtimeClient.resumeRun(runId);
            store.update(result);
            return ResponseEntity.ok(result);
        } catch (HttpClientErrorException.NotFound e) {
            return ResponseEntity.notFound().build();
        }
    }
}
