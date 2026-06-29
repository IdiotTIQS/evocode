package com.evocode.controlplane.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record IntentRequest(
    @NotBlank String intent,
    @NotBlank String projectId,
    String repoPath,
    String sessionId,                  // 可空：会话工作区提交时带上，关联 run 与 session
    List<ConversationTurn> history,    // 可空：本会话多轮对话历史，透传给运行时
    List<ChangeFile> priorChangeSet    // 可空：本会话已生成文件（迭代编辑基线）
) {}
