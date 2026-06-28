package com.evocode.controlplane.dto;

public record ReviewFinding(
    String severity,
    String filePath,
    String message,
    String suggestedFix
) {}
