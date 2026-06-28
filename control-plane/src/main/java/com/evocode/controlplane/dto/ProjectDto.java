package com.evocode.controlplane.dto;

/** Project API 契约，镜像前端 @/types/domain 的 Project。 */
public record ProjectDto(
    String id,
    String name,
    String repoPath,   // 可空
    String createdAt   // ISO-8601
) {}
