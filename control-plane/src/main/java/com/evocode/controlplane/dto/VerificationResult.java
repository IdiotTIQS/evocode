package com.evocode.controlplane.dto;

import java.util.List;

public record VerificationResult(
    boolean checked,
    boolean passed,
    int diagnosticCount,
    List<Diagnostic> diagnostics
) {}
