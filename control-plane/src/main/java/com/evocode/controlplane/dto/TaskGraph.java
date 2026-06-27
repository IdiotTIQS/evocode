package com.evocode.controlplane.dto;

import java.util.List;

public record TaskGraph(
    List<EngineeringTask> tasks
) {}
