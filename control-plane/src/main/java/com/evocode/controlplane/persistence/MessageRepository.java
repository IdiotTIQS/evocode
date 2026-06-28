package com.evocode.controlplane.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MessageRepository extends JpaRepository<MessageRecord, Long> {
    List<MessageRecord> findBySessionIdOrderByCreatedAtAscIdAsc(String sessionId);
    void deleteBySessionIdIn(List<String> sessionIds);
}
