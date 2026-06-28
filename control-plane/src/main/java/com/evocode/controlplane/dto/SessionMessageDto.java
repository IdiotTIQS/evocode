package com.evocode.controlplane.dto;

/** SessionMessage API 契约，镜像前端 @/types/domain 的 SessionMessage。 */
public record SessionMessageDto(
    String id,
    String sessionId,
    String role,       // "user" | "agent"
    String kind,       // "intent" | "status" | "result"
    String text,
    String runId,      // 可空
    String createdAt   // ISO-8601
) {}
