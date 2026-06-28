package com.evocode.controlplane.dto;

import java.util.List;

public record ReviewOutput(
    String verdict,
    List<ReviewFinding> findings,
    String summary
) {}
