package com.evocode.controlplane.dto;

/** Session API 契约，镜像前端 @/types/domain 的 Session。 */
public record SessionDto(
    String id,
    String projectId,
    String title,
    String createdAt,  // ISO-8601
    String updatedAt   // ISO-8601
) {}
