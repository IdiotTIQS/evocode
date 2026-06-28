package com.evocode.controlplane.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 注册/登录请求体。 */
public record AuthRequest(
    @Email @NotBlank String email,
    @NotBlank @Size(min = 8, message = "密码至少 8 位") String password
) {}
