package com.evocode.controlplane.dto;

public record ProjectGraphStats(
    int fileCount,
    int componentCount,
    int importCount,
    Boolean cacheHit,
    Integer graphVersionId
) {}
