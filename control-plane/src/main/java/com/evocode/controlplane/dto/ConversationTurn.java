package com.evocode.controlplane.dto;

/** 一轮历史消息（多轮对话上下文），透传给 AI 运行时。 */
public record ConversationTurn(
    String role,   // "user" | "agent"
    String text
) {}
