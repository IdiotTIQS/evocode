package com.evocode.controlplane.persistence;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "message_record", indexes = {
    @Index(name = "idx_message_mid", columnList = "messageId", unique = true),
    @Index(name = "idx_message_sid", columnList = "sessionId")
})
public class MessageRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String messageId;

    @Column(nullable = false)
    private String sessionId;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String kind;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String text;

    private String runId;  // 可空

    @Column(nullable = false)
    private Instant createdAt;

    protected MessageRecord() {}  // JPA

    public MessageRecord(String messageId, String sessionId, String role, String kind,
                         String text, String runId, Instant createdAt) {
        this.messageId = messageId;
        this.sessionId = sessionId;
        this.role = role;
        this.kind = kind;
        this.text = text;
        this.runId = runId;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getMessageId() { return messageId; }
    public String getSessionId() { return sessionId; }
    public String getRole() { return role; }
    public String getKind() { return kind; }
    public String getText() { return text; }
    public String getRunId() { return runId; }
    public Instant getCreatedAt() { return createdAt; }
}
