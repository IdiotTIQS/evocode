package com.evocode.controlplane.api;

import com.evocode.controlplane.dto.SessionDto;
import com.evocode.controlplane.dto.SessionMessageDto;
import com.evocode.controlplane.dto.SessionMessageRequest;
import com.evocode.controlplane.dto.SessionRequest;
import com.evocode.controlplane.persistence.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// 注意：本端点当前无鉴权，仅供 localhost 使用。鉴权/RBAC 为后续增量。
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

    @GetMapping
    public List<SessionDto> list(@RequestParam(required = false) String projectId) {
        List<SessionRecord> recs = (projectId == null)
            ? sessions.findAllByOrderByUpdatedAtDescIdDesc()
            : sessions.findByProjectIdOrderByUpdatedAtDescIdDesc(projectId);
        return recs.stream().map(SessionController::toDto).toList();
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<SessionDto> get(@PathVariable String sessionId) {
        return sessions.findBySessionId(sessionId).map(SessionController::toDto)
            .map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public SessionDto create(@Valid @RequestBody SessionRequest req) {
        Instant now = Instant.now();
        SessionRecord rec = new SessionRecord(
            UUID.randomUUID().toString(), req.projectId(), req.title(), now, now);
        return toDto(sessions.save(rec));
    }

    @GetMapping("/{sessionId}/messages")
    public ResponseEntity<List<SessionMessageDto>> listMessages(@PathVariable String sessionId) {
        if (sessions.findBySessionId(sessionId).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(
            messages.findBySessionIdOrderByCreatedAtAscIdAsc(sessionId).stream()
                .map(SessionController::toDto).toList());
    }

    /** 追加消息并刷新所属 session 的 updatedAt（等价前端 appendMessage+touchSession）。 */
    @PostMapping("/{sessionId}/messages")
    @Transactional
    public ResponseEntity<SessionMessageDto> appendMessage(
            @PathVariable String sessionId,
            @Valid @RequestBody SessionMessageRequest req) {
        var session = sessions.findBySessionId(sessionId);
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
