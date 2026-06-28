package com.evocode.controlplane.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface RunRepository extends JpaRepository<RunRecord, Long> {
    Optional<RunRecord> findByRunId(String runId);
    List<RunRecord> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);
    List<RunRecord> findByOwnerIdOrderByCreatedAtDescIdDesc(String ownerId, Pageable pageable);
}
