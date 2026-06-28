# Deployment Architecture

> **实现状态（截至 increment：容器化） / Implementation Status**
> 本文档描述的是**目标部署架构**。当前真实运行模式有两种：本地三进程（`scripts/start.{ps1,sh}`），或 **Docker Compose 三容器**。启动见 [docs/RUNNING.md](../RUNNING.md)。
> - ✅ 已构建：**容器化** —— 三服务各有 Dockerfile（ai-runtime: python:3.11-slim；control-plane: maven 多阶段→temurin-21-jre；frontend: node:22 多阶段→Next standalone）+ 根 `docker-compose.yml`（健康检查门控依赖 ai-runtime→control-plane→frontend、命名卷持久化、`.env` 注入 `EVOCODE_JWT_SECRET`、`PYTHON_RUNTIME_BASE_URL=http://ai-runtime:8000`）。也支持本地三进程（一键脚本，自动注入密钥）。**JWT 鉴权 + 所有权隔离**；持久化用 H2 文件库（控制平面）+ SQLite（运行时 checkpoint/知识图谱），Compose 下落命名卷。
> - 📋 计划中：编排平台（Kubernetes）、PostgreSQL（:5432）替 H2、Redis（:6379）、负载均衡 / HTTPS、私有网络与内部 DNS、水平扩缩与读副本、密钥轮换与运行时（:8000）自身鉴权、镜像发布到 registry。
>
> 下文的生产拓扑、K8s/扩缩策略描述的是目标设计；当前可运行的是本地三进程或单机 Docker Compose。

## Overview

EvoCode is deployed as four independent services, each containerized and independently scalable. In local development, all services run as processes on a single machine. In production, they are deployed to a container orchestration platform (Kubernetes or Docker Compose for simpler environments).

---

## Service Topology

> 📋 PostgreSQL 与 Redis 行为目标设计，当前未接入；无容器，三个应用服务以本地进程运行。

| Service | Port | Container | Runtime |
|---|---|---|---|
| Frontend Console | 3000 | `evocode-frontend` | Node.js |
| Spring Boot Control Plane | 8080 | `evocode-control-plane` | JVM (Java 21) |
| Python AI Runtime | 8000 | `evocode-ai-runtime` | Python 3.11 |
| PostgreSQL | 5432 | `evocode-db` | PostgreSQL 16 |
| Redis | 6379 | `evocode-redis` | Redis 7 |

---

## Local Development

Services run as processes, not containers. See the root README for startup order and commands.

Communication is direct:
- Frontend → Control Plane: `http://localhost:8080`
- Control Plane → AI Runtime: `http://localhost:8000`

No authentication in any increment to date. Both services must be bound to localhost. (This is the current, real deployment mode.)

---

## Production Architecture

> 📋 **计划中** — 以下负载均衡、私有网络、PostgreSQL/Redis 拓扑尚未实现。

```
                         ┌─────────────────┐
  HTTPS (443)            │   Load Balancer  │
  ──────────────────────►│  (nginx / ALB)   │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │   Frontend       │
                         │  (evocode-       │
                         │   frontend)      │
                         └────────┬────────┘
                                  │ /api → proxy
                         ┌────────▼────────┐
                         │  Control Plane   │
                         │  (evocode-cp)    │
                         └──────┬──┬───────┘
                                │  │
              ┌─────────────────┘  └─────────────────┐
              │                                       │
    ┌─────────▼──────────┐               ┌────────────▼───────┐
    │   AI Runtime        │               │   PostgreSQL        │
    │  (evocode-runtime)  │               │   Redis             │
    └─────────────────────┘               └────────────────────┘
```

---

## Container Definitions

> 📋 **计划中** — 仓库中目前没有这些 Dockerfile；下方为目标容器定义。

### Frontend (evocode-frontend)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/public public
COPY --from=builder /app/package.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

Environment variables:
- `NEXT_PUBLIC_API_URL` — Control Plane base URL

### Control Plane (evocode-control-plane)

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/control-plane.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Environment variables:
- `SPRING_DATASOURCE_URL` — PostgreSQL connection string
- `SPRING_REDIS_HOST` / `SPRING_REDIS_PORT`
- `EVOCODE_RUNTIME_BASE_URL` — AI Runtime URL
- `JWT_SECRET`

### AI Runtime (evocode-ai-runtime)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e ".[prod]"
COPY . .
EXPOSE 8000
CMD ["uvicorn", "evocode_runtime.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Environment variables:
- `OPENAI_API_KEY` (optional — falls back to stub without it)
- `OPENAI_BASE_URL` (optional)
- `OPENAI_MODEL` (optional)
- `DATABASE_URL` — PostgreSQL connection string
- `NODE_EXTRACTOR_PATH` — path to the ts-morph extractor

---

## Docker Compose (Local Full-Stack)

> 📋 **计划中** — 当前仓库无 `docker-compose.yml`；本地全栈以裸进程方式运行，未使用容器、PostgreSQL 或 Redis。下方为目标 Compose 文件。

```yaml
version: "3.9"
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    depends_on: [control-plane]

  control-plane:
    build: ./control-plane
    ports: ["8080:8080"]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/evocode
      EVOCODE_RUNTIME_BASE_URL: http://ai-runtime:8000
      JWT_SECRET: local-dev-secret
    depends_on: [db, redis, ai-runtime]

  ai-runtime:
    build: ./ai-runtime
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://evocode:evocode@db:5432/evocode
    depends_on: [db]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: evocode
      POSTGRES_USER: evocode
      POSTGRES_PASSWORD: evocode
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

---

## Networking

> 📋 **计划中** — 生产网络隔离、负载均衡与私有 DNS 尚未实现；当前仅 localhost 直连。

In production, the only publicly reachable service is the load balancer. The Control Plane, AI Runtime, and databases are on a private network. Service-to-service communication uses internal DNS names.

| Connection | Exposure |
|---|---|
| Internet → Load Balancer | Public (HTTPS 443) |
| Load Balancer → Frontend | Private |
| Frontend → Control Plane | Private (via proxy) |
| Control Plane → AI Runtime | Private |
| Control Plane → PostgreSQL | Private |
| Control Plane → Redis | Private |
| AI Runtime → PostgreSQL | Private |

---

## Scaling

> 📋 **计划中** — 下方扩缩策略依赖尚未实现的 PostgreSQL/Redis 与容器编排，描述的是目标设计。

| Service | Scaling Strategy |
|---|---|
| Frontend | Horizontal — stateless, scale by replica count |
| Control Plane | Horizontal — stateless HTTP; run state in PostgreSQL/Redis |
| AI Runtime | Horizontal — stateless HTTP; scale by concurrent run capacity |
| PostgreSQL | Vertical + read replicas |
| Redis | Single node (dev/staging), Redis Cluster (production) |
