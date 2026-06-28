package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

/** 新建/更新 Project 的请求体。更新时字段可空（仅合并非空字段）。 */
public record ProjectRequest(
    @NotBlank String name,
    String repoPath
) {}
