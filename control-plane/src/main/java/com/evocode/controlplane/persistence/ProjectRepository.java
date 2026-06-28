package com.evocode.controlplane.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ProjectRepository extends JpaRepository<ProjectRecord, Long> {
    Optional<ProjectRecord> findByProjectId(String projectId);
    List<ProjectRecord> findAllByOrderByCreatedAtDescIdDesc();
    List<ProjectRecord> findByOwnerIdOrderByCreatedAtDescIdDesc(String ownerId);
    void deleteByProjectId(String projectId);
    boolean existsByProjectId(String projectId);
}
