// control-plane/src/test/java/com/evocode/controlplane/RunControllerTest.java
package com.evocode.controlplane;

import com.evocode.controlplane.api.RunController;
import com.evocode.controlplane.dto.*;
import com.evocode.controlplane.persistence.RunStore;
import com.evocode.controlplane.persistence.RunSummary;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
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
    @MockBean RunStore store;

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
