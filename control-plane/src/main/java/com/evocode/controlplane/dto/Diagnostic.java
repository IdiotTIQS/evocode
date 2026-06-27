package com.evocode.controlplane.dto;

public record Diagnostic(
    String file,
    Integer line,
    int code,
    String message
) {}
