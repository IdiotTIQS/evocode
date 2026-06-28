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

    /** 持久化一次运行（按 runId upsert），记录属主。序列化失败时记录日志但不抛出。 */
    public void save(IntentRequest req, RunResult result, String ownerId) {
        try {
            String json = mapper.writeValueAsString(result);
            RunRecord rec = repo.findByRunId(result.runId())
                .map(existing -> {  // 已存在：仅刷新随审批门变化的可变字段
                    existing.update(result.status(), result.phase(), result.message(), json);
                    return existing;
                })
                .orElseGet(() ->    // 新记录：构造器已设全字段
                    new RunRecord(result.runId(), req.projectId(), ownerId, req.intent(),
                        result.status(), result.phase(), result.message(), json, Instant.now()));
            repo.save(rec);
        } catch (Exception e) {  // 序列化或写库异常都吞掉
            log.warn("RunStore.save failed for runId={}", result.runId(), e);
        }
    }

    /** resume 后刷新已存在运行的状态/阶段/结果。无原始 IntentRequest，按 runId 定位现有记录。 */
    public void update(RunResult result) {
        try {
            var existing = repo.findByRunId(result.runId());
            if (existing.isEmpty()) {
                // 运行时 checkpoint 存在但 DB 无记录（通常因初始 /api/intents 的 save 静默失败）。
                // 此时运行时状态会与 DB 产生分歧，记录足够上下文供排查。
                log.warn("RunStore.update: no record for runId={} (status={}, phase={}); "
                        + "runtime/DB state diverged, skipping",
                    result.runId(), result.status(), result.phase());
                return;
            }
            RunRecord rec = existing.get();
            rec.update(result.status(), result.phase(), result.message(),
                mapper.writeValueAsString(result));
            repo.save(rec);
        } catch (Exception e) {
            log.warn("RunStore.update failed for runId={}", result.runId(), e);
        }
    }

    public List<RunSummary> list(int limit) {
        return repo.findAllByOrderByCreatedAtDescIdDesc(PageRequest.of(0, limit)).stream()
            .map(RunStore::toSummary).toList();
    }

    /** 按属主列出运行（非 ADMIN 用）。 */
    public List<RunSummary> listByOwner(String ownerId, int limit) {
        return repo.findByOwnerIdOrderByCreatedAtDescIdDesc(ownerId, PageRequest.of(0, limit)).stream()
            .map(RunStore::toSummary).toList();
    }

    private static RunSummary toSummary(RunRecord r) {
        return new RunSummary(r.getRunId(), r.getProjectId(), r.getIntent(),
            r.getStatus(), r.getPhase(), r.getMessage(), r.getCreatedAt());
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

    /** 取运行的属主 id（用于访问控制）；无记录或遗留无属主时为空。 */
    public Optional<String> ownerOf(String runId) {
        return repo.findByRunId(runId).map(RunRecord::getOwnerId);
    }
}
