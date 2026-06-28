package com.evocode.controlplane.auth;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "app_user",
    indexes = @Index(name = "idx_user_email", columnList = "email", unique = true))
public class UserRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String userId;     // 对外暴露的稳定 id（UUID），用于 ownerId 关联

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String role;       // "ADMIN" | "USER"

    @Column(nullable = false)
    private Instant createdAt;

    protected UserRecord() {}  // JPA

    public UserRecord(String userId, String email, String passwordHash, String role,
                      Instant createdAt) {
        this.userId = userId;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getRole() { return role; }
    public Instant getCreatedAt() { return createdAt; }
}
