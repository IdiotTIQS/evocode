package com.evocode.controlplane.dto;

/** 更新 Project 的补丁（PATCH）。字段为空表示不修改；repoPath 传空串表示清除。 */
public record ProjectPatch(
    String name,
    String repoPath
) {}
