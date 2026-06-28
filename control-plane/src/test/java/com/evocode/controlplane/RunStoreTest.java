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
            runId, "completed", null, "reviewed",
            new TaskGraph(List.of(new EngineeringTask("t1", "前端页面", "frontend", "做页面"))),
            null, List.of(), List.of(), null,
            new ReviewOutput("approve", List.of(), "ok"),
            "done");
    }

    @Test
    void save_then_get_roundtrips_full_result() {
        var req = new IntentRequest("加联系页", "demo", null, null);
        store.save(req, sampleResult("run-rt-1"), "owner-1");

        Optional<RunResult> got = store.get("run-rt-1");
        assertTrue(got.isPresent());
        assertEquals("reviewed", got.get().phase());
        assertEquals("approve", got.get().review().verdict());
        assertEquals(1, got.get().taskGraph().tasks().size());
        assertEquals("owner-1", store.ownerOf("run-rt-1").orElse(null));
    }

    @Test
    void list_returns_recent_first_with_summary_fields() {
        store.save(new IntentRequest("意图A", "projA", null, null), sampleResult("run-list-a"), "owner-1");
        store.save(new IntentRequest("意图B", "projB", null, null), sampleResult("run-list-b"), "owner-1");

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
    void list_by_owner_only_returns_that_owners_runs() {
        store.save(new IntentRequest("A 的", "p", null, null), sampleResult("run-owner-a"), "owner-a");
        store.save(new IntentRequest("B 的", "p", null, null), sampleResult("run-owner-b"), "owner-b");

        List<RunSummary> aRuns = store.listByOwner("owner-a", 10);
        assertTrue(aRuns.stream().anyMatch(r -> r.runId().equals("run-owner-a")));
        assertTrue(aRuns.stream().noneMatch(r -> r.runId().equals("run-owner-b")));
    }

    @Test
    void list_by_session_scopes_to_that_session() {
        store.save(new IntentRequest("会话 S1", "p", null, "sess-1"), sampleResult("run-s1-a"), "owner-x");
        store.save(new IntentRequest("会话 S1", "p", null, "sess-1"), sampleResult("run-s1-b"), "owner-x");
        store.save(new IntentRequest("会话 S2", "p", null, "sess-2"), sampleResult("run-s2-a"), "owner-x");

        List<RunSummary> s1 = store.listByOwnerAndSession("owner-x", "sess-1", 10);
        assertEquals(2, s1.size());
        assertTrue(s1.stream().allMatch(r -> "sess-1".equals(r.sessionId())));
        assertTrue(s1.stream().noneMatch(r -> r.runId().equals("run-s2-a")));

        // 另一个属主即便同 sessionId 也看不到
        List<RunSummary> other = store.listByOwnerAndSession("owner-y", "sess-1", 10);
        assertTrue(other.isEmpty());
    }

    @Test
    void get_unknown_runId_returns_empty() {
        assertTrue(store.get("does-not-exist").isEmpty());
    }
}
