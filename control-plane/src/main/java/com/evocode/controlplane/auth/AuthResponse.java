package com.evocode.controlplane.auth;

/** 认证响应：JWT + 用户公开信息（不含密码哈希）。 */
public record AuthResponse(
    String token,
    UserDto user
) {
    public record UserDto(String userId, String email, String role) {}
}
