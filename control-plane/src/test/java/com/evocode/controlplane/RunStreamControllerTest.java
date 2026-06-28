package com.evocode.controlplane;

import com.evocode.controlplane.auth.JwtService;
import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.persistence.RunStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Optional;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RunStreamControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;
    @MockBean PythonRuntimeClient runtimeClient;
    @MockBean RunStore store;

    private String alice;

    @BeforeEach
    void setup() {
        alice = "Bearer " + jwt.issue("user-alice", "alice@e.com", "USER");
    }

    private static final String GATE_FRAME =
        "{\"type\":\"gate\",\"result\":{\"runId\":\"r1\",\"status\":\"waiting_approval\","
        + "\"gate\":\"plan\",\"phase\":\"architected\",\"taskGraph\":{\"tasks\":[]},"
        + "\"message\":\"ok\"}}";

    @Test
    void unauthenticated_returns_401() throws Exception {
        mvc.perform(post("/api/runs/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"x\",\"projectId\":\"p\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void stream_forwards_frames_and_persists_terminal_with_owner() throws Exception {
        doAnswer(inv -> {
            Consumer<String> onData = inv.getArgument(1);
            onData.accept("{\"type\":\"run\",\"runId\":\"r1\"}");
            onData.accept("{\"type\":\"phase\",\"node\":\"understand\",\"label\":\"L\"}");
            onData.accept(GATE_FRAME);
            return null;
        }).when(runtimeClient).streamRun(any(IntentRequest.class), any());

        mvc.perform(post("/api/runs/stream").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"add page\",\"projectId\":\"demo\"}"))
            .andExpect(request().asyncStarted())
            .andReturn();

        // 后台虚拟线程异步转发；终帧应触发 save（携带属主 user-alice）。轮询等待其落地。
        verify(runtimeClient, timeout(5000)).streamRun(any(IntentRequest.class), any());
        verify(store, timeout(5000).times(1)).save(any(IntentRequest.class), any(), eq("user-alice"));
    }

    @Test
    void approve_stream_owner_persists_via_update() throws Exception {
        when(store.ownerOf(eq("r1"))).thenReturn(Optional.of("user-alice"));
        doAnswer(inv -> {
            Consumer<String> onData = inv.getArgument(1);
            onData.accept("{\"type\":\"phase\",\"node\":\"generate\",\"label\":\"L\"}");
            onData.accept("{\"type\":\"done\",\"result\":{\"runId\":\"r1\",\"status\":\"completed\","
                + "\"gate\":null,\"phase\":\"applied\",\"taskGraph\":{\"tasks\":[]},\"message\":\"done\"}}");
            return null;
        }).when(runtimeClient).streamResume(eq("r1"), any());

        mvc.perform(post("/api/runs/r1/approve/stream").header("Authorization", alice))
            .andExpect(request().asyncStarted())
            .andReturn();

        verify(store, timeout(5000).times(1)).update(any());
        verify(store, never()).save(any(), any(), any());
    }

    @Test
    void approve_stream_non_owner_does_not_touch_runtime() throws Exception {
        String bob = "Bearer " + jwt.issue("user-bob", "bob@e.com", "USER");
        when(store.ownerOf(eq("r1"))).thenReturn(Optional.of("user-alice"));

        // 非属主：控制器在 emitter 内以 404 收尾，且不调用运行时。
        mvc.perform(post("/api/runs/r1/approve/stream").header("Authorization", bob))
            .andReturn();
        verify(runtimeClient, never()).streamResume(any(), any());
    }
}
