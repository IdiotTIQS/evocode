package com.evocode.controlplane.persistence;

import java.time.Instant;

public record RunSummary(
    String runId,
    String projectId,
    String intent,
    String status,
    String phase,
    String message,
    Instant createdAt
) {}
