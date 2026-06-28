# EvoCode Frontend — Next.js 15 standalone (Node 22, pnpm)
# 浏览器在宿主机运行 → NEXT_PUBLIC_CONTROL_PLANE_URL 默认 http://localhost:8080
# （宿主发布端口），无需指向 compose 内部 DNS。如需改，在 build 阶段传 build-arg。

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 浏览器侧控制平面地址：构建期内联，默认宿主发布端口。
ARG NEXT_PUBLIC_CONTROL_PLANE_URL=http://localhost:8080
ENV NEXT_PUBLIC_CONTROL_PLANE_URL=${NEXT_PUBLIC_CONTROL_PLANE_URL}
RUN pnpm build

# ---- run ----
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# standalone 产物自包含 server.js + 最小 node_modules；另需 static 与 public。
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000

# 用 node 自带的 http 探测（node:22-slim 不含 wget/curl）。
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "require('http').get('http://localhost:3000',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"]

CMD ["node", "server.js"]
