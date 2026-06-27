package com.evocode.controlplane.dto;

public record ChangeFile(
    String path,
    String content
) {}
