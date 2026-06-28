package com.evocode.controlplane.api;

import com.evocode.controlplane.auth.AuthPrincipal;
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
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Project CRUD，按当前用户所有权隔离：
 *   - list 仅返回自己的项目（ADMIN 返回全部）
 *   - get/patch/delete 非属主一律 404（不泄露存在性），ADMIN 可访问任意
 *   - create 记录 ownerId 为当前用户
 * 鉴权由 SecurityConfig 保证（无 token 到不了这里）。
 */
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

    /** 取本人可访问的项目（属主匹配或 ADMIN）；否则空。 */
    private Optional<ProjectRecord> accessible(String projectId, AuthPrincipal me) {
        return repo.findByProjectId(projectId)
            .filter(p -> me.isAdmin() || me.userId().equals(p.getOwnerId()));
    }

    @GetMapping
    public List<ProjectDto> list(@AuthenticationPrincipal AuthPrincipal me) {
        List<ProjectRecord> recs = me.isAdmin()
            ? repo.findAllByOrderByCreatedAtDescIdDesc()
            : repo.findByOwnerIdOrderByCreatedAtDescIdDesc(me.userId());
        return recs.stream().map(ProjectController::toDto).toList();
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<ProjectDto> get(@PathVariable String projectId,
                                          @AuthenticationPrincipal AuthPrincipal me) {
        return accessible(projectId, me).map(ProjectController::toDto)
            .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ProjectDto create(@Valid @RequestBody ProjectRequest req,
                             @AuthenticationPrincipal AuthPrincipal me) {
        String repoPath = (req.repoPath() == null || req.repoPath().isBlank())
            ? null : req.repoPath();
        ProjectRecord rec = new ProjectRecord(
            UUID.randomUUID().toString(), me.userId(), req.name(), repoPath, Instant.now());
        return toDto(repo.save(rec));
    }

    @PatchMapping("/{projectId}")
    @Transactional
    public ResponseEntity<ProjectDto> patch(@PathVariable String projectId,
                                            @RequestBody ProjectPatch patch,
                                            @AuthenticationPrincipal AuthPrincipal me) {
        return accessible(projectId, me).map(rec -> {
            rec.applyPatch(patch.name(), patch.repoPath());
            return ResponseEntity.ok(toDto(repo.save(rec)));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{projectId}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable String projectId,
                                       @AuthenticationPrincipal AuthPrincipal me) {
        if (accessible(projectId, me).isEmpty()) return ResponseEntity.notFound().build();
        List<String> sessionIds = sessions.findByProjectId(projectId).stream()
            .map(SessionRecord::getSessionId).toList();
        if (!sessionIds.isEmpty()) {
            messages.deleteBySessionIdIn(sessionIds);
        }
        sessions.deleteByProjectId(projectId);
        repo.deleteByProjectId(projectId);
        return ResponseEntity.noContent().build();
    }
}
