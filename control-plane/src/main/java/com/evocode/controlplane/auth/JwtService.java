package com.evocode.controlplane.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/** JWT 签发与校验。HS256，subject=userId，自定义 claim 携带 email/role。 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlMillis;

    public JwtService(
            @Value("${evocode.jwt.secret:}") String secret,
            @Value("${evocode.jwt.ttl-hours:24}") long ttlHours) {
        // 必须显式配置 evocode.jwt.secret（>=32 字节）。缺省或仍是占位值时启动即失败，
        // 杜绝「用提交在源码里的默认密钥签发可被任何人伪造的 token」。
        if (secret == null || secret.isBlank() || secret.startsWith("change-me")) {
            throw new IllegalStateException(
                "evocode.jwt.secret 未配置：请通过环境变量/配置提供 >=32 字节的随机密钥后再启动");
        }
        // HS256 要求 >= 256bit；不足时 Keys.hmacShaKeyFor 会抛错，提示配置更长密钥。
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttlMillis = Duration.ofHours(ttlHours).toMillis();
    }

    public String issue(String userId, String email, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId)
            .claim("email", email)
            .claim("role", role)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusMillis(ttlMillis)))
            .signWith(key)
            .compact();
    }

    /** 校验并解析；失败（过期/篡改/格式错）抛 JwtException，由 filter 捕获。 */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
    }
}
