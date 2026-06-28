package com.evocode.controlplane.auth;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

/** 注册 / 登录 / 当前用户。注册首位用户为 ADMIN，其余为 USER。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody AuthRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "邮箱已注册");
        }
        // 首位注册用户成为 ADMIN（引导管理员），其余 USER。
        String role = users.count() == 0 ? "ADMIN" : "USER";
        UserRecord rec = new UserRecord(
            UUID.randomUUID().toString(), email,
            encoder.encode(req.password()), role, Instant.now());
        users.save(rec);
        return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(rec));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody AuthRequest req) {
        String email = req.email().trim().toLowerCase();
        UserRecord rec = users.findByEmail(email)
            .filter(u -> encoder.matches(req.password(), u.getPasswordHash()))
            .orElseThrow(() -> new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "邮箱或密码错误"));
        return toResponse(rec);
    }

    /**
     * 当前登录用户（校验 token 有效性 + 前端水合用户信息）。
     * 注意：直接取自 JWT claim，不回查 DB——被删除/改角色的用户在 token 过期前（最长 ttl-hours）
     * 仍返回旧信息。对当前开发态可接受；若需即时失效应引入 token 撤销表或缩短 ttl。
     */
    @GetMapping("/me")
    public AuthResponse.UserDto me(@AuthenticationPrincipal AuthPrincipal principal) {
        if (principal == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        return new AuthResponse.UserDto(
            principal.userId(), principal.email(), principal.role());
    }

    private AuthResponse toResponse(UserRecord rec) {
        String token = jwt.issue(rec.getUserId(), rec.getEmail(), rec.getRole());
        return new AuthResponse(token,
            new AuthResponse.UserDto(rec.getUserId(), rec.getEmail(), rec.getRole()));
    }
}
