package com.evocode.controlplane.client;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.Consumer;

@Component
public class PythonRuntimeClient {

    private final RestClient restClient;
    // 流式专用 client：禁用缓冲，确保 SSE 帧逐条到达而非整体缓冲。
    private final RestClient streamClient;

    @SuppressWarnings("deprecation")  // setBufferRequestBody 在 Spring 6.1 弃用；升级时改用 JdkClientHttpRequestFactory
    public PythonRuntimeClient(@Value("${python.runtime.base-url}") String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(factory)
            .build();

        SimpleClientHttpRequestFactory streamFactory = new SimpleClientHttpRequestFactory();
        streamFactory.setBufferRequestBody(false);
        // 读超时：上游挂起时不致永久占用 SSE 线程（agent 运行可较慢，给足 15 分钟）。
        streamFactory.setReadTimeout((int) Duration.ofMinutes(15).toMillis());
        this.streamClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(streamFactory)
            .build();
    }

    public RunResult createRun(IntentRequest request) {
        return restClient.post()
            .uri("/runs")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(RunResult.class);
    }

    /** 批准后续跑：让 Python 运行时从 checkpoint 越过当前审批门到下一个门或完成。 */
    public RunResult resumeRun(String runId) {
        return restClient.post()
            .uri("/runs/{runId}/resume", runId)
            .retrieve()
            .body(RunResult.class);
    }

    /**
     * 流式提交意图：逐条读取 Python 运行时 SSE 帧，每读到一行 `data: ...` 就回调。
     * 阻塞当前线程直至流结束；调用方应在独立线程中执行（见 SseEmitter 用法）。
     */
    public void streamRun(IntentRequest request, Consumer<String> onData) {
        streamClient.post()
            .uri("/runs/stream")
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .body(request)
            .exchange((req, resp) -> { forwardSse(resp.getBody(), onData); return null; });
    }

    /** 流式续跑：同 streamRun，针对 /runs/{id}/resume/stream。 */
    public void streamResume(String runId, Consumer<String> onData) {
        streamClient.post()
            .uri("/runs/{runId}/resume/stream", runId)
            .accept(MediaType.TEXT_EVENT_STREAM)
            .exchange((req, resp) -> { forwardSse(resp.getBody(), onData); return null; });
    }

    /** 逐行读取上游 SSE 体，对每个 `data: {json}` 行回调 JSON 负载（去掉前缀）。 */
    private static void forwardSse(InputStream body, Consumer<String> onData) {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(body, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("data: ")) {
                    onData.accept(line.substring("data: ".length()));
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("SSE upstream read failed", e);
        }
    }
}
