package com.evocode.controlplane.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<UserRecord, Long> {
    Optional<UserRecord> findByEmail(String email);
    Optional<UserRecord> findByUserId(String userId);
    boolean existsByEmail(String email);
}
