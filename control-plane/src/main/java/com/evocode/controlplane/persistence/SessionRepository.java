package com.evocode.controlplane.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SessionRepository extends JpaRepository<SessionRecord, Long> {
    Optional<SessionRecord> findBySessionId(String sessionId);
    List<SessionRecord> findByOwnerIdOrderByUpdatedAtDescIdDesc(String ownerId);
    List<SessionRecord> findByProjectIdAndOwnerIdOrderByUpdatedAtDescIdDesc(String projectId, String ownerId);
    List<SessionRecord> findByProjectId(String projectId);  // 级联删除用（属主校验已在上游）
    // ADMIN 视图（全部，可选按 project 过滤）——避免 findAll 全量入内存再排序。
    List<SessionRecord> findAllByOrderByUpdatedAtDescIdDesc();
    List<SessionRecord> findByProjectIdOrderByUpdatedAtDescIdDesc(String projectId);
    void deleteByProjectId(String projectId);
}
