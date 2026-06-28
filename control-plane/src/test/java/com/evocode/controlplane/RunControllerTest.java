// control-plane/src/test/java/com/evocode/controlplane/RunControllerTest.java
package com.evocode.controlplane;

import com.evocode.controlplane.auth.JwtService;
import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.*;
import com.evocode.controlplane.persistence.RunRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RunControllerTest {

    @Autowired MockMvc mvc;
    @Autowired RunRepository runs;
    @Autowired JwtService jwt;
    @MockBean PythonRuntimeClient runtimeClient;  // 不真打 Python 运行时

    private String alice;
    private String bob;

    @BeforeEach
    void setup() {
        runs.deleteAll();
        alice = "Bearer " + jwt.issue("user-alice", "alice@e.com", "USER");
        bob = "Bearer " + jwt.issue("user-bob", "bob@e.com", "USER");
    }

    private RunResult sample(String runId, String status, String gate, String phase) {
        return new RunResult(runId, status, gate, phase,
            new TaskGraph(List.of()), null, List.of(), List.of(), null, null, "msg");
    }

    @Test
    void unauthenticated_returns_401() throws Exception {
        mvc.perform(get("/api/runs")).andExpect(status().isUnauthorized());
    }

    @Test
    void submit_via_intents_records_owner_then_list_scoped() throws Exception {
        when(runtimeClient.createRun(org.mockito.ArgumentMatchers.any()))
            .thenReturn(sample("r-alice", "waiting_approval", "plan", "architected"));
        mvc.perform(post("/api/intents").header("Authorization", alice)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"add page\",\"projectId\":\"p\"}"))
            .andExpect(status().isOk());

        // Alice 看得到，Bob 看不到
        mvc.perform(get("/api/runs").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].runId").value("r-alice"));
        mvc.perform(get("/api/runs").header("Authorization", bob))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void other_user_cannot_get_or_approve_run() throws Exception {
        when(runtimeClient.createRun(org.mockito.ArgumentMatchers.any()))
            .thenReturn(sample("r-alice", "waiting_approval", "plan", "architected"));
        mvc.perform(post("/api/intents").header("Authorization", alice)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"x\",\"projectId\":\"p\"}"))
            .andExpect(status().isOk());

        mvc.perform(get("/api/runs/r-alice").header("Authorization", bob))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/runs/r-alice/approve").header("Authorization", bob))
            .andExpect(status().isNotFound());
        // 属主可取
        mvc.perform(get("/api/runs/r-alice").header("Authorization", alice))
            .andExpect(status().isOk());
    }

    @Test
    void approve_resumes_for_owner() throws Exception {
        when(runtimeClient.createRun(org.mockito.ArgumentMatchers.any()))
            .thenReturn(sample("r1", "waiting_approval", "plan", "architected"));
        mvc.perform(post("/api/intents").header("Authorization", alice)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"x\",\"projectId\":\"p\"}"))
            .andExpect(status().isOk());

        when(runtimeClient.resumeRun(eq("r1")))
            .thenReturn(sample("r1", "waiting_approval", "diff", "reviewed"));
        mvc.perform(post("/api/runs/r1/approve").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.gate").value("diff"));
    }

    @Test
    void get_missing_returns_404() throws Exception {
        mvc.perform(get("/api/runs/nope").header("Authorization", alice))
            .andExpect(status().isNotFound());
    }

    @Test
    void list_filtered_by_session_returns_only_that_sessions_runs() throws Exception {
        // 两次提交分别带不同 sessionId（runtime mock 返回不同 runId）。
        when(runtimeClient.createRun(org.mockito.ArgumentMatchers.any()))
            .thenReturn(sample("r-s1", "waiting_approval", "plan", "architected"));
        mvc.perform(post("/api/intents").header("Authorization", alice)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"a\",\"projectId\":\"p\",\"sessionId\":\"sess-1\"}"))
            .andExpect(status().isOk());

        when(runtimeClient.createRun(org.mockito.ArgumentMatchers.any()))
            .thenReturn(sample("r-s2", "waiting_approval", "plan", "architected"));
        mvc.perform(post("/api/intents").header("Authorization", alice)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"intent\":\"b\",\"projectId\":\"p\",\"sessionId\":\"sess-2\"}"))
            .andExpect(status().isOk());

        mvc.perform(get("/api/runs").param("sessionId", "sess-1").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].runId").value("r-s1"))
            .andExpect(jsonPath("$[0].sessionId").value("sess-1"));
    }
}
