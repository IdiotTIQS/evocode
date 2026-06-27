package com.evocode.controlplane.dto;

public record RunAcknowledgement(
    String runId,
    String status,
    String message
) {}
