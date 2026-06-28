package com.evocode.controlplane.api;

import com.evocode.controlplane.auth.AuthPrincipal;
import com.evocode.controlplane.dto.SessionDto;
import com.evocode.controlplane.dto.SessionMessageDto;
import com.evocode.controlplane.dto.SessionMessageRequest;
import com.evocode.controlplane.dto.SessionRequest;
import com.evocode.controlplane.persistence.*;
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
 * Session + 嵌套 Message，按当前用户所有权隔离：
 *   - list 仅本人会话（ADMIN 全部）；可选 projectId 过滤
 *   - get/messages/append 非属主一律 404
 *   - create 记 ownerId 为当前用户
 */
@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final SessionRepository sessions;
    private final MessageRepository messages;

    public SessionController(SessionRepository sessions, MessageRepository messages) {
        this.sessions = sessions;
        this.messages = messages;
    }

    private static SessionDto toDto(SessionRecord r) {
        return new SessionDto(r.getSessionId(), r.getProjectId(), r.getTitle(),
            r.getCreatedAt().toString(), r.getUpdatedAt().toString());
    }

    private static SessionMessageDto toDto(MessageRecord r) {
        return new SessionMessageDto(r.getMessageId(), r.getSessionId(), r.getRole(),
            r.getKind(), r.getText(), r.getRunId(), r.getCreatedAt().toString());
    }

    /** 取本人可访问的会话（属主匹配或 ADMIN）。 */
    private Optional<SessionRecord> accessible(String sessionId, AuthPrincipal me) {
        return sessions.findBySessionId(sessionId)
            .filter(s -> me.isAdmin() || me.userId().equals(s.getOwnerId()));
    }

    @GetMapping
    public List<SessionDto> list(@RequestParam(required = false) String projectId,
                                 @AuthenticationPrincipal AuthPrincipal me) {
        List<SessionRecord> recs;
        if (me.isAdmin()) {
            recs = (projectId == null)
                ? sessions.findAllByOrderByUpdatedAtDescIdDesc()
                : sessions.findByProjectIdOrderByUpdatedAtDescIdDesc(projectId);
        } else if (projectId == null) {
            recs = sessions.findByOwnerIdOrderByUpdatedAtDescIdDesc(me.userId());
        } else {
            recs = sessions.findByProjectIdAndOwnerIdOrderByUpdatedAtDescIdDesc(projectId, me.userId());
        }
        return recs.stream().map(SessionController::toDto).toList();
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<SessionDto> get(@PathVariable String sessionId,
                                          @AuthenticationPrincipal AuthPrincipal me) {
        return accessible(sessionId, me).map(SessionController::toDto)
            .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public SessionDto create(@Valid @RequestBody SessionRequest req,
                             @AuthenticationPrincipal AuthPrincipal me) {
        Instant now = Instant.now();
        SessionRecord rec = new SessionRecord(
            UUID.randomUUID().toString(), req.projectId(), me.userId(), req.title(), now, now);
        return toDto(sessions.save(rec));
    }

    @GetMapping("/{sessionId}/messages")
    public ResponseEntity<List<SessionMessageDto>> listMessages(
            @PathVariable String sessionId, @AuthenticationPrincipal AuthPrincipal me) {
        if (accessible(sessionId, me).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(
            messages.findBySessionIdOrderByCreatedAtAscIdAsc(sessionId).stream()
                .map(SessionController::toDto).toList());
    }

    /** 追加消息并刷新所属 session 的 updatedAt（仅属主/ADMIN）。 */
    @PostMapping("/{sessionId}/messages")
    @Transactional
    public ResponseEntity<SessionMessageDto> appendMessage(
            @PathVariable String sessionId,
            @Valid @RequestBody SessionMessageRequest req,
            @AuthenticationPrincipal AuthPrincipal me) {
        var session = accessible(sessionId, me);
        if (session.isEmpty()) return ResponseEntity.notFound().build();

        Instant now = Instant.now();
        MessageRecord rec = new MessageRecord(
            UUID.randomUUID().toString(), sessionId, req.role(), req.kind(),
            req.text(), (req.runId() == null || req.runId().isBlank()) ? null : req.runId(),
            now);
        MessageRecord saved = messages.save(rec);
        session.get().touch(now);
        sessions.save(session.get());
        return ResponseEntity.ok(toDto(saved));
    }
}
