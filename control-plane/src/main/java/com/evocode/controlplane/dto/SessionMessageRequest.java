package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

/** 追加消息的请求体（id/sessionId/createdAt 由服务端生成）。 */
public record SessionMessageRequest(
    @NotBlank String role,   // "user" | "agent"
    @NotBlank String kind,   // "intent" | "status" | "result"
    @NotBlank String text,
    String runId             // 可空
) {}
