package com.evocode.controlplane.auth;

/** 认证主体：放入 SecurityContext，控制器经 @AuthenticationPrincipal 取用。 */
public record AuthPrincipal(String userId, String email, String role) {
    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
