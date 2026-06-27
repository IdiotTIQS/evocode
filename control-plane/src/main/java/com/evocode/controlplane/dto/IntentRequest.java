package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

public record IntentRequest(
    @NotBlank String intent,
    @NotBlank String projectId,
    String repoPath
) {}
