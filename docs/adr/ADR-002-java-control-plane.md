# ADR-002: Java / Spring Boot as the Control Plane

## Status

Accepted

## 实现状态（截至 increment 6）

决策本身有效：选用 Java/Spring Boot 作为控制平面的方向成立。但本 ADR 的 Context/Decision 把鉴权、持久化、多租户、WebFlux/SSE、Redis 等能力描述为「已内建/从第一天起即具备」，与实际不符——当前 `control-plane/pom.xml` 仅含 `spring-boot-starter-web` / `-actuator` / `-validation` / `-test`，控制平面目前是一个**无鉴权、无持久化的转发层**。

- ✅ 已建：
  - `POST /api/intents` REST 转发到 Python AI 运行时 `/runs`（IntentController + PythonRuntimeClient）
  - CORS 配置（WebCorsConfig）
  - `/actuator/health`
  - DTO 四层契约镜像（含 ReviewOutput/ReviewFinding），与 `contracts/` 对齐
- 📋 计划中（pom.xml 无对应依赖、代码无对应包）：
  - Spring Security / JWT 鉴权与 RBAC 授权（无 `security/` 包，当前**无任何鉴权**，仅 localhost 可达）
  - Spring Data JPA / PostgreSQL 持久化、Run 状态持久化、多租户隔离
  - Spring WebFlux / SSE 流式（当前为同步阻塞转发，非 reactive）
  - Redis 会话 / 运行队列
  - GraalVM 原生镜像、限流、虚拟线程等运维优化

下文 Decision 列出的 `-starter-security` / `-starter-data-jpa` / `-starter-webflux` 模块均为**目标依赖**，尚未加入 pom.xml。

## Date

2026-06-28

## Context

The Control Plane is the most operationally demanding layer in EvoCode. It handles:

- Authentication and authorization with JWT and role-based access control
- Multi-tenancy: all resources are scoped to a tenant, all queries are tenant-filtered
- State management for long-running, multi-step agent orchestration workflows
- API gateway responsibilities: validation, rate limiting, routing
- Observability: health checks, metrics, tracing

These are enterprise API concerns, and the Java/Spring Boot ecosystem has solved them comprehensively. Spring Security provides a production-grade security framework. Spring Data JPA handles multi-tenant data isolation patterns. Spring Actuator provides out-of-the-box health and metrics endpoints. Spring WebFlux supports reactive, non-blocking handling of the SSE streams used for agent event streaming.

Additionally, Java's strong type system and compile-time checks make it appropriate for the layer that is the authoritative owner of run state — correctness and predictability matter more than development speed at this layer.

## Decision

The Control Plane is implemented in Java 21 with Spring Boot 3.

Key Spring Boot modules used:
- `spring-boot-starter-web` — REST API layer
- `spring-boot-starter-security` — JWT authentication, RBAC
- `spring-boot-starter-data-jpa` — entity management and multi-tenant queries
- `spring-boot-starter-actuator` — health, metrics, readiness/liveness probes
- `spring-boot-starter-validation` — request validation (Bean Validation / Jakarta)
- `spring-boot-starter-webflux` — SSE streaming for agent events (reactive subset)

Java 21 specifically, for:
- Virtual threads (Project Loom) — high-concurrency request handling without reactive programming complexity
- Record types — concise, immutable DTOs
- Pattern matching and sealed classes — expressive domain modeling

## Consequences

**Positive:**
- Production-grade security from day one with Spring Security
- Multi-tenancy patterns are well-documented and tested in Spring Data
- Actuator endpoints satisfy operational requirements with zero custom code
- Strong typing catches contract violations at compile time
- Large ecosystem of enterprise integrations (OAuth2, LDAP, cloud-provider SDKs)

**Negative:**
- Longer build times compared to Python or Node.js
- Higher memory footprint than a lightweight Python service
- JVM startup time is slower than Python or Node.js (mitigated by Spring Boot's optimizations and GraalVM native compilation for production)
- Java developers must understand the Python and TypeScript layers to contribute holistically

**Mitigations:**
- Maven daemon and incremental compilation address build times in local development
- Container deployment with pre-warmed JVMs addresses startup latency
- GraalVM native image is available for Phase 5 production optimization

## Alternatives Considered

### Python / FastAPI for the Control Plane

Rejected. Python lacks the mature multi-tenancy and security frameworks that Spring Boot provides. Building production-grade RBAC and tenant isolation from scratch in FastAPI would consume engineering time that should go to agent development.

### Node.js / NestJS for the Control Plane

Rejected. NestJS is viable but less mature for enterprise security patterns than Spring Boot. The team's expertise in Spring Boot outweighs NestJS's language-consistency advantages.

### Go (net/http or Gin) for the Control Plane

Rejected. Go is performant and operationally simple but lacks the ORM, security, and observability ecosystem depth of Spring Boot for this use case.
