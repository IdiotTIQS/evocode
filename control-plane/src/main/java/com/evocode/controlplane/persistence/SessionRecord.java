package com.evocode.controlplane.persistence;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "session_record", indexes = {
    @Index(name = "idx_session_sid", columnList = "sessionId", unique = true),
    @Index(name = "idx_session_pid", columnList = "projectId")
})
public class SessionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String sessionId;

    @Column(nullable = false)
    private String projectId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    protected SessionRecord() {}  // JPA

    public SessionRecord(String sessionId, String projectId, String title,
                         Instant createdAt, Instant updatedAt) {
        this.sessionId = sessionId;
        this.projectId = projectId;
        this.title = title;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public Long getId() { return id; }
    public String getSessionId() { return sessionId; }
    public String getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    /** 刷新 updatedAt（新消息写入时调用）。 */
    public void touch(Instant when) {
        this.updatedAt = when;
    }
}
