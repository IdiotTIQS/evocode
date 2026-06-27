# EvoCode

EvoCode is a four-layer agent-driven software engineering platform that enables autonomous code generation and system evolution through intelligent intent processing.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend Console (Port 3000)               │
│         User Interface & Intent Submission              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         Spring Boot Control Plane (Port 8080)           │
│  Orchestration, Request Routing & State Management      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│          Python AI Runtime (Port 8000)                  │
│    Intent Analysis, Code Generation & Execution        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            Business Services Layer                      │
│  Validation, Storage, Sandboxing & Repository I/O      │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

- **`frontend/`** - Next.js/TypeScript frontend application
- **`control-plane/`** - Spring Boot service for orchestration
- **`ai-runtime/`** - Python service for intent processing and code generation
- **`services/`** - Business service implementations and utilities
- **`contracts/`** - Cross-layer contract definitions (single source of truth)

## Local Development

### Startup Order

Start services in this order to ensure proper initialization. These are the exact
commands verified end-to-end for increment 0 (Windows paths shown for the venv;
on macOS/Linux use `.venv/bin/...`).

1. **Python AI Runtime** (Port 8000)
   ```bash
   cd ai-runtime
   python -m venv .venv
   .venv/Scripts/python -m pip install -e ".[dev]"
   .venv/Scripts/python -m uvicorn evocode_runtime.main:app --port 8000
   ```

2. **Spring Boot Control Plane** (Port 8080)
   ```bash
   cd control-plane
   mvn spring-boot:run
   ```

3. **Frontend Console** (Port 3000)
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

### Verified End-to-End Check

With the Python runtime and Spring Boot control plane running, submit an intent
through the gateway. The request is forwarded to the Python runtime, which runs a
LangGraph `understand → plan` pipeline and returns a real planned `TaskGraph`:

```bash
curl -X POST http://localhost:8080/api/intents \
  -H "Content-Type: application/json" \
  -d '{"intent":"add a comments api and a product page","projectId":"shop"}'
# → {"runId":"<uuid>","status":"completed","phase":"planned",
#    "taskGraph":{"tasks":[
#      {"id":"task-1","title":"实现前端界面","kind":"frontend",...},
#      {"id":"task-2","title":"实现后端 API","kind":"backend",...},
#      {"id":"task-3","title":"编写测试","kind":"test",...}]},
#    "message":"Planned 3 task(s) for project shop"}

curl http://localhost:8080/actuator/health   # → {"status":"UP"}
curl http://localhost:8000/health            # → {"status":"ok"}
```

The Planner uses a deterministic stub LLM by default (no credentials needed). Set
`OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL` / `OPENAI_MODEL`) to switch the
runtime to an OpenAI-compatible provider. A blank `intent` is rejected by the
control plane with HTTP 400 (bean validation).

### Prerequisites

- Python 3.11 (the runtime is pinned to 3.11; use a venv as shown above)
- JDK 21
- Node.js 22 + pnpm 10
- Maven 3.9
- Git

### Security Note (Increment 0)

Increment 0 has **no authentication** on the control plane or the Python runtime.
Bind both services to `localhost` only and do not expose them to a network.
The Spring Boot control plane is the designated enterprise/auth layer —
authentication, RBAC, and a tightened CORS policy land in a later increment
before any non-local deployment.

## Cross-Layer Contracts

All layers adhere to the contract definitions in the `contracts/` directory. These schemas define:

- **IntentRequest**: Structure for user intents and project context
- **RunAcknowledgement**: Response format for intent processing results

See `contracts/README.md` for details on maintaining contract consistency across layers.

## Contributing

When modifying contracts or adding features:

1. Update the contract if needed in `contracts/`
2. Synchronize changes to all affected layers
3. Test cross-layer integration
4. Document changes in relevant layer READMEs

## License

EvoCode is part of the agent-driven engineering platform.
