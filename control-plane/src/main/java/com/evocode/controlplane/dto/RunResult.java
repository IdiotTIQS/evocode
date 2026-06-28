package com.evocode.controlplane.dto;

import java.util.List;

public record RunResult(
    String runId,
    String status,
    String gate,
    String phase,
    TaskGraph taskGraph,
    ProjectGraphStats graphStats,
    List<ChangeFile> changeSet,
    List<String> appliedFiles,
    VerificationResult verification,
    ReviewOutput review,
    String message
) {}
