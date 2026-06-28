package com.evocode.controlplane.persistence;

import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class RunStore {

    private static final Logger log = LoggerFactory.getLogger(RunStore.class);

    private final RunRepository repo;
    private final ObjectMapper mapper;

    public RunStore(RunRepository repo, ObjectMapper mapper) {
        this.repo = repo;
        this.mapper = mapper;
    }

    /** 持久化一次运行。序列化失败时记录日志但不抛出（绝不拖垮 /api/intents）。 */
    public void save(IntentRequest req, RunResult result) {
        try {
            String json = mapper.writeValueAsString(result);
            RunRecord rec = new RunRecord(
                result.runId(), req.projectId(), req.intent(),
                result.status(), result.phase(), result.message(),
                json, Instant.now());
            repo.save(rec);
        } catch (Exception e) {  // 序列化或写库异常都吞掉
            log.warn("RunStore.save failed for runId={}", result.runId(), e);
        }
    }

    public List<RunSummary> list(int limit) {
        return repo.findAllByOrderByCreatedAtDescIdDesc(PageRequest.of(0, limit)).stream()
            .map(r -> new RunSummary(r.getRunId(), r.getProjectId(), r.getIntent(),
                r.getStatus(), r.getPhase(), r.getMessage(), r.getCreatedAt()))
            .toList();
    }

    public Optional<RunResult> get(String runId) {
        return repo.findByRunId(runId).flatMap(r -> {
            try {
                return Optional.of(mapper.readValue(r.getResultJson(), RunResult.class));
            } catch (Exception e) {
                log.warn("RunStore.get deserialize failed for runId={}", runId, e);
                return Optional.empty();
            }
        });
    }
}
