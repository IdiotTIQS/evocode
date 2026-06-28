package com.evocode.controlplane.persistence;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "run_record", indexes = @Index(name = "idx_run_id", columnList = "runId", unique = true))
public class RunRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String runId;

    private String projectId;

    @Lob
    private String intent;

    private String status;
    private String phase;

    @Lob
    private String message;

    @Lob
    @Column(columnDefinition = "CLOB")
    private String resultJson;

    @Column(nullable = false)
    private Instant createdAt;

    protected RunRecord() {}  // JPA

    public RunRecord(String runId, String projectId, String intent, String status,
                     String phase, String message, String resultJson, Instant createdAt) {
        this.runId = runId;
        this.projectId = projectId;
        this.intent = intent;
        this.status = status;
        this.phase = phase;
        this.message = message;
        this.resultJson = resultJson;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getRunId() { return runId; }
    public String getProjectId() { return projectId; }
    public String getIntent() { return intent; }
    public String getStatus() { return status; }
    public String getPhase() { return phase; }
    public String getMessage() { return message; }
    public String getResultJson() { return resultJson; }
    public Instant getCreatedAt() { return createdAt; }
}
