// api/RunStreamController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * SSE 流式端点：把 Python 运行时的逐节点进度帧转发给浏览器，并在终帧持久化 RunResult。
 * 与 /api/intents、/api/runs/{id}/approve 共享同一图与中断语义（批准前零落盘），
 * 仅多了逐节点进度推送。前端在 SSE 失败时回退到非流式 POST 路径。
 *
 * 注意：本端点当前无鉴权，仅供 localhost 使用。
 */
@RestController
@RequestMapping("/api/runs")
public class RunStreamController {

    private static final Logger log = LoggerFactory.getLogger(RunStreamController.class);
    // SSE 连接需独立线程：转发期间阻塞读上游流。用虚拟线程（Java 21），数量由 OS 约束，
    // 避免 newCachedThreadPool 在突发/上游挂起时无界堆积平台线程。
    private static final ExecutorService EXEC = Executors.newVirtualThreadPerTaskExecutor();

    private final PythonRuntimeClient runtimeClient;
    private final RunStore store;
    private final ObjectMapper mapper;

    public RunStreamController(PythonRuntimeClient runtimeClient, RunStore store,
                              ObjectMapper mapper) {
        this.runtimeClient = runtimeClient;
        this.store = store;
        this.mapper = mapper;
    }

    @PostMapping("/stream")
    public SseEmitter stream(@Valid @RequestBody IntentRequest request) {
        SseEmitter emitter = newEmitter();
        EXEC.execute(() -> {
            try {
                runtimeClient.streamRun(request, frame -> forward(emitter, frame, request));
                emitter.complete();
            } catch (Exception e) {
                log.warn("stream run failed for project {}", request.projectId(), e);
                emitter.completeWithError(e);
            }
        });
        return emitter;
    }

    @PostMapping("/{runId}/approve/stream")
    public SseEmitter approveStream(@PathVariable String runId) {
        SseEmitter emitter = newEmitter();
        EXEC.execute(() -> {
            try {
                runtimeClient.streamResume(runId, frame -> forward(emitter, frame, null));
                emitter.complete();
            } catch (Exception e) {
                log.warn("stream approve failed for run {}", runId, e);
                emitter.completeWithError(e);
            }
        });
        return emitter;
    }

    /** 创建无超时 SseEmitter 并登记生命周期回调，使超时/错误在日志可见。 */
    private SseEmitter newEmitter() {
        SseEmitter emitter = new SseEmitter(0L);  // 不超时：agent 运行可能数分钟
        emitter.onTimeout(() -> log.debug("SSE emitter timeout"));
        emitter.onError(e -> log.debug("SSE emitter error", e));
        return emitter;
    }

    /** 转发一帧给浏览器；先持久化终帧再发送，确保浏览器中途断开也不致 DB 滞后。 */
    private void forward(SseEmitter emitter, String frameJson, IntentRequest origin) {
        // 先持久化：终帧此刻已从上游完整收到，先落库与批量路径行为一致，
        // 即便浏览器在本帧断开（send 抛 IOException）DB 也已更新。
        persistIfTerminal(frameJson, origin);
        try {
            emitter.send(SseEmitter.event().data(frameJson));
        } catch (IOException e) {
            // 浏览器断开：放弃转发（上游线程会随读完/异常收尾）。终帧已在上面落库。
            throw new RuntimeException("client disconnected", e);
        }
    }

    /** 终帧（gate/done/failed）携带完整 RunResult：保存或更新到 RunStore。 */
    private void persistIfTerminal(String frameJson, IntentRequest origin) {
        try {
            JsonNode node = mapper.readTree(frameJson);
            String type = node.path("type").asText();
            if (!node.has("result")) return;
            RunResult result = mapper.treeToValue(node.get("result"), RunResult.class);
            if ("gate".equals(type) || "done".equals(type) || "failed".equals(type)) {
                if (origin != null) {
                    store.save(origin, result);   // 首段（提交意图）：创建记录
                } else {
                    store.update(result);          // 续跑段：刷新已存在记录
                }
            }
        } catch (Exception e) {
            log.warn("persist terminal SSE frame failed", e);  // 持久化失败不影响流转发
        }
    }
}
