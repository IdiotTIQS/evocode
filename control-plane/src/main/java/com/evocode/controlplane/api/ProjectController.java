package com.evocode.controlplane.api;

import com.evocode.controlplane.dto.ProjectDto;
import com.evocode.controlplane.dto.ProjectPatch;
import com.evocode.controlplane.dto.ProjectRequest;
import com.evocode.controlplane.persistence.MessageRepository;
import com.evocode.controlplane.persistence.ProjectRecord;
import com.evocode.controlplane.persistence.ProjectRepository;
import com.evocode.controlplane.persistence.SessionRecord;
import com.evocode.controlplane.persistence.SessionRepository;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 注意：本端点当前无鉴权，仅供 localhost 使用。鉴权/RBAC 为后续增量。
@RestController
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectRepository repo;
    private final SessionRepository sessions;
    private final MessageRepository messages;

    public ProjectController(ProjectRepository repo, SessionRepository sessions,
                             MessageRepository messages) {
        this.repo = repo;
        this.sessions = sessions;
        this.messages = messages;
    }

    private static ProjectDto toDto(ProjectRecord r) {
        return new ProjectDto(r.getProjectId(), r.getName(), r.getRepoPath(),
            r.getCreatedAt().toString());
    }

    @GetMapping
    public List<ProjectDto> list() {
        return repo.findAllByOrderByCreatedAtDescIdDesc().stream().map(ProjectController::toDto).toList();
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<ProjectDto> get(@PathVariable String projectId) {
        return repo.findByProjectId(projectId).map(ProjectController::toDto)
            .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ProjectDto create(@Valid @RequestBody ProjectRequest req) {
        String repoPath = (req.repoPath() == null || req.repoPath().isBlank())
            ? null : req.repoPath();
        ProjectRecord rec = new ProjectRecord(
            UUID.randomUUID().toString(), req.name(), repoPath, Instant.now());
        return toDto(repo.save(rec));
    }

    @PatchMapping("/{projectId}")
    @Transactional
    public ResponseEntity<ProjectDto> patch(@PathVariable String projectId,
                                            @RequestBody ProjectPatch patch) {
        return repo.findByProjectId(projectId).map(rec -> {
            rec.applyPatch(patch.name(), patch.repoPath());
            return ResponseEntity.ok(toDto(repo.save(rec)));
        }).orElse(ResponseEntity.notFound().build());
    }

    /** 删除项目并级联清理其会话与消息（schema 无外键，手动级联）。 */
    @DeleteMapping("/{projectId}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable String projectId) {
        if (!repo.existsByProjectId(projectId)) return ResponseEntity.notFound().build();
        List<String> sessionIds = sessions
            .findByProjectIdOrderByUpdatedAtDescIdDesc(projectId).stream()
            .map(SessionRecord::getSessionId).toList();
        if (!sessionIds.isEmpty()) {
            messages.deleteBySessionIdIn(sessionIds);
        }
        sessions.deleteByProjectId(projectId);
        repo.deleteByProjectId(projectId);
        return ResponseEntity.noContent().build();
    }
}
