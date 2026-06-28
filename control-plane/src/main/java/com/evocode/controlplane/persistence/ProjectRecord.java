package com.evocode.controlplane.persistence;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "project_record", indexes = {
    @Index(name = "idx_project_pid", columnList = "projectId", unique = true),
    @Index(name = "idx_project_owner", columnList = "ownerId")
})
public class ProjectRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String projectId;

    private String ownerId;  // 属主 userId；遗留数据可空（仅 ADMIN 可见）

    @Column(nullable = false)
    private String name;

    private String repoPath;  // 可空

    @Column(nullable = false)
    private Instant createdAt;

    protected ProjectRecord() {}  // JPA

    public ProjectRecord(String projectId, String ownerId, String name, String repoPath,
                         Instant createdAt) {
        this.projectId = projectId;
        this.ownerId = ownerId;
        this.name = name;
        this.repoPath = repoPath;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getProjectId() { return projectId; }
    public String getOwnerId() { return ownerId; }
    public String getName() { return name; }
    public String getRepoPath() { return repoPath; }
    public Instant getCreatedAt() { return createdAt; }

    /** 合并补丁：name 非空则改名；repoPath 非 null 则更新（空串表示清除）。 */
    public void applyPatch(String name, String repoPath) {
        if (name != null && !name.isBlank()) this.name = name;
        if (repoPath != null) this.repoPath = repoPath.isEmpty() ? null : repoPath;
    }
}
