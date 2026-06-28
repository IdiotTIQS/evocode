package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

public record IntentRequest(
    @NotBlank String intent,
    @NotBlank String projectId,
    String repoPath,
    String sessionId   // 可空：会话工作区提交时带上，关联 run 与 session
) {}
