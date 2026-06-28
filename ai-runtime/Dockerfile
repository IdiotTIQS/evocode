# EvoCode AI Runtime — FastAPI + LangGraph (Python 3.11)
# 注：可选的 Node ts-extractor（repoPath 知识图谱分析）未装入本镜像——
# 缺失时 understand 节点优雅降级为占位图，核心意图/审批门流程不受影响。
FROM python:3.11-slim

WORKDIR /app

# 先装依赖（利用层缓存）：仅 pyproject 变更才重装。
COPY pyproject.toml ./
# 需要源码树存在才能 editable 安装；先建占位包元数据。
COPY src ./src
RUN pip install --no-cache-dir -e .

# checkpoint / 知识图谱 SQLite 落在 /app/data（compose 挂命名卷持久化）。
ENV EVOCODE_CHECKPOINT_DB=/app/data/checkpoints.db \
    EVOCODE_PKG_DB=/app/data/pkg.db
RUN mkdir -p /app/data

EXPOSE 8000

# 健康检查：/health（compose 也会探测）。
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health',timeout=2).status==200 else 1)"

CMD ["python", "-m", "uvicorn", "evocode_runtime.main:app", "--host", "0.0.0.0", "--port", "8000"]
