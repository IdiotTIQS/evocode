package com.evocode.controlplane.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SessionRepository extends JpaRepository<SessionRecord, Long> {
    Optional<SessionRecord> findBySessionId(String sessionId);
    List<SessionRecord> findAllByOrderByUpdatedAtDescIdDesc();
    List<SessionRecord> findByProjectIdOrderByUpdatedAtDescIdDesc(String projectId);
    void deleteByProjectId(String projectId);
}
