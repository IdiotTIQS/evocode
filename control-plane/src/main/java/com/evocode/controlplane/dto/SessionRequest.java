package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;

/** 新建 Session 的请求体。 */
public record SessionRequest(
    @NotBlank String projectId,
    @NotBlank String title
) {}
