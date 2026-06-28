# EvoCode Control Plane — Spring Boot (Java 21)
# 多阶段：maven 构建 jar → 精简 JRE 运行。

# ---- build ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# 先拉依赖（利用层缓存）：仅 pom 变更才重新解析。
COPY pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---- run ----
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar

# H2 文件库落在 /app/data（compose 挂命名卷持久化）。
RUN mkdir -p /app/data
EXPOSE 8080

# 健康检查：actuator/health。
HEALTHCHECK --interval=10s --timeout=3s --start-period=40s --retries=10 \
  CMD ["sh", "-c", "wget -qO- http://localhost:8080/actuator/health | grep -q UP"]

# EVOCODE_JWT_SECRET 必须经环境注入（compose 从 .env 传入），否则启动即失败。
ENTRYPOINT ["java", "-jar", "app.jar"]
