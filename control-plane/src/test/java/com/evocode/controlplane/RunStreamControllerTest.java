package com.evocode.controlplane;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.persistence.RunStore;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

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
    @MockBean PythonRuntimeClient runtimeClient;
    @MockBean RunStore store;

    private static final String GATE_FRAME =
        "{\"type\":\"gate\",\"result\":{\"runId\":\"r1\",\"status\":\"waiting_approval\","
        + "\"gate\":\"plan\",\"phase\":\"architected\",\"taskGraph\":{\"tasks\":[]},"
        + "\"message\":\"ok\"}}";

    @Test
    void stream_forwards_frames_and_persists_terminal() throws Exception {
        // 模拟运行时：回调若干进度帧 + 终帧 gate。
        doAnswer(inv -> {
            Consumer<String> onData = inv.getArgument(1);
            onData.accept("{\"type\":\"run\",\"runId\":\"r1\"}");
            onData.accept("{\"type\":\"phase\",\"node\":\"understand\",\"label\":\"L\"}");
            onData.accept(GATE_FRAME);
            return null;
        }).when(runtimeClient).streamRun(any(IntentRequest.class), any());

        MvcResult mvcResult = mvc.perform(post("/api/runs/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"add page\",\"projectId\":\"demo\"}"))
            .andExpect(request().asyncStarted())
            .andReturn();

        mvc.perform(asyncDispatch(mvcResult))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("understand")))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("\"gate\":\"plan\"")));

        // 终帧应触发 save（首段创建记录）。
        verify(store, times(1)).save(any(IntentRequest.class), any());
    }

    @Test
    void approve_stream_persists_via_update() throws Exception {
        doAnswer(inv -> {
            Consumer<String> onData = inv.getArgument(1);
            onData.accept("{\"type\":\"phase\",\"node\":\"generate\",\"label\":\"L\"}");
            onData.accept("{\"type\":\"done\",\"result\":{\"runId\":\"r1\",\"status\":\"completed\","
                + "\"gate\":null,\"phase\":\"applied\",\"taskGraph\":{\"tasks\":[]},\"message\":\"done\"}}");
            return null;
        }).when(runtimeClient).streamResume(eq("r1"), any());

        MvcResult mvcResult = mvc.perform(post("/api/runs/r1/approve/stream"))
            .andExpect(request().asyncStarted())
            .andReturn();

        mvc.perform(asyncDispatch(mvcResult))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("\"type\":\"done\"")));

        // 续跑段应走 update（刷新已存在记录），不应调用 save。
        verify(store, times(1)).update(any());
        verify(store, never()).save(any(), any());
    }
}
