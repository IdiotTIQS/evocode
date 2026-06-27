package com.evocode.controlplane.dto;

public record RunResult(
    String runId,
    String status,
    String phase,
    TaskGraph taskGraph,
    ProjectGraphStats graphStats,
    String message
) {}
